import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { load } from "npm:cheerio@1.0.0";

import { articleIsFresh } from "./article-date.ts";
import { sourceRecovery } from "./recovery-policy.ts";
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{headers,status});
const clean=(v:unknown)=>String(v||"").replace(/\s+/g," ").trim();
const comparable=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const words=(s:string)=>new Set(comparable(s).split(" ").filter(w=>w.length>4));
function similarity(a:string,b:string){
 const A=words(a),B=words(b);
 let count=0;for(const w of A)if(B.has(w))count++;
 return count/Math.max(1,A.size+B.size-count);
}
const hasFiniteVerb=(s:string)=>/(?<![\p{L}])(é|são|foi|foram|está|estão|estava|estavam|tem|têm|teve|terá|há|haverá|pode|podem|poderá|deve|devem|será|serão|disse|diz|afirma|afirmou|anunciou|determinou|determina|decidiu|decide|investiga|investigam|investigou|prendeu|prenderam|registra|registrou|cai|caiu|subiu|sobe|chega|chegou|fez|faz|marca|marcou|dará|fará|reduziu|aumentou|planeja|planejam|recebeu|recebe|aponta|apontou|deixa|deixou|ocorreu|ocorre|difere|privatizará|ficou|ficaram|mantém|confirmou|confirma|realizará|realizou|retotalizará|atingiu|atinge|segue|seguem|retoma|retomou|apresenta|apresentou|explica|explicou|destaca|destacou|aprova|aprovou|rejeita|rejeitou|começa|começou|trabalham|trabalhou|atuam|atua|traz|trouxe|anula|anulou|lançou|lança|prevê|previu|define|definiu|obriga|obrigou|aciona|acionou|renova|renovam|renovaram|remove|removem|removeram|liberou|liberaram|garantiu|garantem|bloqueia|bloqueou|paralisa|paralisou|interrompe|interromperá|retorna|retornarão|afeta|afetará|registram|registraram|fica|ficará|indica|indicou|publicou|divulgou|desmentiu|provocou|adiou|retirou|enfrenta|sofreu|alertou|alerta|suspende|suspendeu|revela|revelou|prorroga|prorrogou|expande|amplia|vence|venceu|vencem|venceram|derrota|derrotou|goleia|goleou|golearam|empata|empatou|empataram|perde|perdeu|perderam|eliminou|elimina|eliminaram|classificou|classificaram|avancou|avancaram|terminou|terminaram|vitória|vitoria|informa|informou)(?![\p{L}])/iu.test(s);
function meaningfulSegments(title:string,summary:string,caption:string,source:string) {
 const strip=(v:string)=>v
   .replace(/https?:\/\/\S+/gi," ")
   .replace(/#[\p{L}\p{N}_]+/gu," ")
   .replace(/\s+/g," ").trim();
 const articlePart=String(caption||"").split(/\b(?:Fonte|Matéria original|Notícia original):/i)[0];
 const sourceSentences=[title,summary,articlePart]
   // Paragraphs are factual units too: captions frequently have line breaks without a final period.
   .flatMap(x=>String(x||"").replace(/\r/g,"").split(/\n+/))
   .map(strip).flatMap(x=>x.replace(/\b([A-Z])\./g,"$1§")
     .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/u).map(part=>part.replace(/§/g,".")));
 const facts:string[]=[];
 for(const raw of sourceSentences){
   const s=clean(raw).replace(/^[.!?\s-]+/,"").replace(/[.!?]+$/,"");
   if(!s||/^(foto|divulgacao|reproducao|crédito|credito):/i.test(s))continue;
   // Author biographies and subscription boilerplate are not article facts.
   if(/é redator|produção jornalística|conteúdos para plataformas digitais|sobre o autor|biografia|inscreva-se|acompanhar notícias/i.test(s))continue;
   // Never trim a sentence to fit the image: this can silently change the factual meaning.
   // Only a COMPLETE short sentence or a naturally delimited independent clause can be used.
   const candidate=s.length<=110?s:s.split(/[,;:]\s+/)[0];
   if(candidate.length>110||!fitCard(candidate))continue;
   if(candidate.length<28||candidate.length>110)continue;
   if(!hasFiniteVerb(candidate))continue;
   // Never emit a cut-off private-name initial or a trailing person-name fragment.
   if(/\b[A-Z]\.$/.test(candidate)||/^[A-Z]\.(?:\s|$)/.test(candidate))continue;
   // A standalone, capitalized factual clause; never take detached trailing fragments.
   if(!/^[A-ZÀ-Ý0-9]/.test(candidate))continue;
   if(/\b(e|ou|de|do|da|dos|das|no|na|nos|nas|ao|aos|com|para|que|pelo|pela|pelos|pelas|um|uma|o|a|os|as|em|por|sobre|após|durante)$/i.test(candidate))continue;
   if(/segue atuante|reafirma seu compromisso|reforça seu compromisso|no combate à criminalidade|garantia da segurança da população/i.test(candidate))continue;
   if(/[—]/.test(candidate)&&/foto|crédito|credito/i.test(candidate))continue;
   const fact=candidate.replace(/[.!?]+$/,"").trim()+".";
   if(!fitCard(fact)||facts.some(p=>similarity(p,fact)>.62))continue;
   facts.push(fact);
   if(facts.length===3)break;
 }
 // Prefer three distinct verified facts. If the source supports exactly two facts,
 // use a factual two-scene story plus a clearly editorial subscription CTA.
 // Never invent a third fact or release stories with fewer than two verified facts.
 const closing="Você pode acompanhar notícias de Rondônia e do Brasil. Inscreva-se no Giro Madeira.";
 return facts.length===3?facts:(facts.length===2&&fitCard(closing)?[...facts,closing]:null);
}
function fitCard(v:string){
 const parts=v.replace(/[\r\n]+/g," ").replace(/\s+/g," ").trim().split(" ");
 let current="",lines=0;
 for(const word of parts){
   if(word.length>28)return false;
   if((current+" "+word).trim().length>28){lines++;current=word;}
   else current=(current+" "+word).trim();
 }
 if(current)lines++;
 return lines>0&&lines<=4;
}
Deno.serve(async req=>{
 if(req.method!=="POST")return respond({success:false,error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)return respond({success:false,error:"server_not_configured"},503);
 const token=req.headers.get("x-giro-db-key")||"";
 if(!token)return respond({success:false,error:"unauthorized"},401);
 const db=createClient(url,key,{auth:{persistSession:false}});
 const valid=await db.rpc("validar_giro_dispatch_key",{p_key:token});
 if(valid.error||valid.data!==true)return respond({success:false,error:"unauthorized"},401);
 try{
   const args=await req.json().catch(()=>({}));
   const lane=await db.from('giro_channel_settings').select('preparation_enabled').eq('channel','tiktok').single();
   if(lane.error)throw lane.error;
   if(args.dry_run===true||!lane.data.preparation_enabled)return respond({success:true,dry_run:args.dry_run===true,no_publish:true,channel:'tiktok',preparation_enabled:lane.data.preparation_enabled});
   const {data:pending,error:qerr}=await db.from("giro_social_video_queue")
     .select("id,source_kind,source_id,platform,status,source_url,shorts_render_retry_count")
     .eq("platform","tiktok").in("storyboard_status",["aguardando","revisar"]).eq("visual_review_status","pending")
     .eq("status","pronto_para_revisao").or("storyboard_prepared_at.is.null,storyboard_prepared_at.lte."+new Date(Date.now()-15*60000).toISOString()).gte("created_at",new Date(Date.now()-36*3600000).toISOString()).order("scheduled_for",{ascending:true}).limit(24);
   if(qerr)throw qerr;
   const results=[];
   for(const item of pending||[]){
     if(item.source_kind!=="radar")continue;
     const radar=await db.from("giro_radar_tiktok")
       .select("id,titulo,url,fonte_id,score,source_published_at,created_at")
       .eq("id",item.source_id).maybeSingle();
     if(radar.error)throw radar.error;
     const row=radar.data;
     let scenes:string[]|null=null;
     let fault:string|null=null;
     if(!row || Number(row.score||0)<25){
       fault="radar_source_missing_or_low_score";
     }else if(row.source_published_at && Date.parse(row.source_published_at)<Date.now()-48*3600000){
       fault="source_outdated";
     }else{
       try{
         const sourceUrl=new URL(String(row.url||""));
         if(sourceUrl.protocol!=="https:" || String(row.url)!==String(item.source_url||row.url))
           throw Error("source_url_mismatch");
         const sourceResp=await fetch(sourceUrl.toString(),{
           headers:{"User-Agent":"Mozilla/5.0 (compatible; GiroMadeiraShorts/1.0)","Accept":"text/html","Accept-Language":"pt-BR,pt;q=0.9"},
           signal:AbortSignal.timeout(9000)
         });
         if(!sourceResp.ok)throw Error("source_http_"+sourceResp.status);
         const type=String(sourceResp.headers.get("content-type")||"");
         if(type && !type.includes("text/html"))throw Error("non_html_source");
         const html=(await sourceResp.text()).slice(0,1800000);
         const $=load(html);
         // Verify the article date itself; homepage/RSS discovery timestamps can be misleading.
         let published=String($('meta[property="article:published_time"]').attr("content")||$('meta[name="datePublished"]').attr("content")||"");
         if(!published){
           for(const el of $('script[type="application/ld+json"]').toArray()){
             try{
               const raw=JSON.parse($(el).text());
               const nodes=[...(Array.isArray(raw)?raw:[raw]),...(raw?.['@graph']||[])];
               const article=nodes.find(n=>/NewsArticle|Article/.test(String(n?.['@type']||''))&&n?.datePublished);
               if(article){published=String(article.datePublished);break;}
             }catch{}
           }
         }
         if(!articleIsFresh(published,sourceUrl.toString()))
           throw Error("article_date_unverified_or_outdated");
         $("script,style,nav,footer,header,aside,form,iframe,.advertisement,.ads,.related,.share-buttons,.newsletter").remove();
         const description=clean($('meta[property="og:description"]').attr("content")||$('meta[name="description"]').attr("content")||"");
         const facts=$("article p, .entry-content p, .post-content p, .article-body p, main p").toArray()
           .map(el=>clean($(el).text())).filter(t=>t.length>=40&&t.length<=650)
           .filter(t=>!/^(publicidade|compartilhe|leia tamb[eé]m|assine|clique aqui|receba not[ií]cias)/i.test(t))
           .slice(0,16).join("\n");
         scenes=meaningfulSegments(clean(row.titulo),description,facts,"Radar Giro Madeira");
         if(!scenes||scenes.length!==3||!scenes.every(fitCard))fault="insufficient_verified_facts";
       }catch(e){
         fault=e instanceof Error && /source_url_mismatch|non_html_source|source_http_|article_date_unverified_or_outdated/.test(e.message)
           ?e.message:"source_fetch_or_parse_failed";
       }
     }
     const valid=!!(scenes&&!fault);
     const retries=Number(item.shorts_render_retry_count||0);
     const recovery=sourceRecovery(fault,retries);
     const patch=valid?{
       scene_cards:scenes,story_image_url:null,storyboard_status:"preparado",
       storyboard_prepared_at:new Date().toISOString(),storyboard_error:null
     }:recovery?{
       status:recovery==="retry"?"pronto_para_revisao":"falha",storyboard_status:"revisar",
       storyboard_error:fault,last_error:"Falha temporária da fonte; preservar a mesma pauta, sem publicar.",
       shorts_render_retry_count:retries+1,storyboard_prepared_at:new Date().toISOString()
     }:{
       // An unverified source must not monopolize today's upload slot.
       // Preserve its audit record; the independent planner will choose another Radar item.
       status:"expirado",storyboard_status:"invalido",
       last_error:"Short não produzido: "+String(fault||"insufficient_verified_facts"),
       storyboard_error:fault||"insufficient_verified_facts",
       storyboard_prepared_at:new Date().toISOString()
     };
     const {error:uerr}=await db.from("giro_social_video_queue")
       .update(patch).eq("id",item.id)
       .in("storyboard_status",["aguardando","revisar"]).eq("visual_review_status","pending");
     if(uerr)throw uerr;
     results.push({queue_id:item.id,storyboard_ready:valid,status:valid?"preparado":"revisar"});
   }
   return respond({success:true,processed:results.length,results,
      renderer_deployed:false,uploads_enabled:false,paid_api_calls:0});
 }catch(e){
   console.error("Shorts storyboard processing failed",e instanceof Error?e.name:"error");
   return respond({success:false,error:"storyboard_internal_error"},500);
 }
});


