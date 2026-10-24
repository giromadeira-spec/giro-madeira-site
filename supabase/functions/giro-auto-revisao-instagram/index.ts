import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const respond=(o:unknown,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const norm=(s:unknown)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/&#(?:\d+|x[0-9a-f]+);/gi," ").replace(/&(?:nbsp|amp|quot|ldquo|rdquo|rsquo);/gi," ")
  .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
function allowed(url:string){
 try{const u=new URL(url);
  const hosts=["www.cnnbrasil.com.br","cnnbrasil.com.br","www.rondoniadinamica.com","rondoniadinamica.com",
   "portaljipa.com.br","www.portaljipa.com.br","www.rondoniaovivo.com","rondoniaovivo.com",
   "agenciabrasil.ebc.com.br","g1.globo.com","www.g1.globo.com","www.nahoraonline.com","nahoraonline.com","newsrondonia.com.br","www.newsrondonia.com.br",
   // Portais regionais do radar. A revisao continua exigindo manchete e fatos presentes na materia original.
   "www.rondoniagora.com","rondoniagora.com","www.tudorondonia.com","tudorondonia.com","rondonoticias.com.br","www.rondonoticias.com.br",
   "extraderondonia.com.br","www.extraderondonia.com.br","jhnoticias.com.br","www.jhnoticias.com.br","rotapolicialnews.com.br","www.rotapolicialnews.com.br",
   "sgc.com.br","www.sgc.com.br","www.euideal.com","euideal.com","www.alertarolim.com.br","rolimnoticias.com.br","www.rolimnoticias.com.br",
   "ariquemes190.com.br","www.ariquemes190.com.br","jaruonline.com.br","www.jaruonline.com.br","folhadosulonline.com.br","www.folhadosulonline.com.br",
   "www.gentedeopiniao.com.br","gentedeopiniao.com.br","www.rondoniadigital.com","rondoniadigital.com","www.sictv.com.br","sictv.com.br","ge.globo.com"];
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.pathname.length<17)return null;
  if(!hosts.includes(u.hostname)&&!u.hostname.endsWith(".gov.br"))return null;
  if(["cnnbrasil.com.br","www.cnnbrasil.com.br"].includes(u.hostname)&&!u.pathname.endsWith("/"))u.pathname+="/";
  return u;
 }catch{return null;}
}
async function sourceCheck(item:any){
 const u=allowed(String(item.fonte_url||""));if(!u)return {ok:false,reason:"source_not_allowlisted"};
 try{
  const r=await fetch(u,{redirect:"follow",signal:AbortSignal.timeout(15000),
    headers:{"Accept":"text/html","User-Agent":"GiroMadeiraEditorialValidator/1.0"}});
  if(!r.ok||!String(r.headers.get("content-type")||"").includes("text/html"))
    return {ok:false,reason:"source_html_unavailable"};
  const finalUrl=allowed(r.url);
  if(!finalUrl)return {ok:false,reason:"source_redirect_outside_allowlist"};
  const raw=(await r.text()).slice(0,1250000);
  const metaTags=raw.match(/<meta\b[^>]*>/gi)||[];
  const ogTag=metaTags.find((tag:string)=>/(?:property|name)=["']og:title["']/i.test(tag));
  const metaTitle=ogTag?.match(/content=["']([^"']+)/i)?.[1]||"";
  const title=norm(metaTitle||raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"");
  const body=norm(raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));
  const words=norm(item.titulo).split(" ").filter(x=>x.length>=4);
  if(words.length<4||words.filter((w:string)=>title.includes(w)).length<Math.ceil(words.length*.75))
    return {ok:false,reason:"headline_not_verified_in_source"};
  // Every number in the newly generated summary must be grounded in source.
  // Do not include the URL, source attribution or hashtags in this inspection.
  const copy=String(item.legenda||"").split("\n\nFonte:")[0];
  const digits=[...new Set(norm(copy).match(/\b(?:20\d{2}|\d{1,6})\b/g)||[])];
  if(digits.some(x=>!body.includes(x)))return {ok:false,reason:"unverified_numerical_claim"};
  // Require a meaningful overlap beyond the headline.
  const paras=copy.split(/\n+/).map(x=>norm(x)).filter(x=>x.length>=80);
  if(paras.length===0)return {ok:false,reason:"insufficient_written_facts"};
  const sceneTokens=paras[0].split(" ").filter((x:string)=>x.length>=5);
  if(sceneTokens.length<10||sceneTokens.filter((w:string)=>body.includes(w)).length<Math.ceil(sceneTokens.length*.64))
    return {ok:false,reason:"summary_not_grounded_in_article"};
  return {ok:true,reason:"source_headline_and_claims_verified"};
 }catch{return {ok:false,reason:"source_fetch_unavailable"};}
}
async function validAsset(origin:string,media:string,prefix:string,type:string){
 try{
  const u=new URL(media);
  if(u.origin!==origin||!u.pathname.startsWith(prefix)||!u.pathname.endsWith(type==="video/mp4"?".mp4":".jpg"))return false;
  const r=await fetch(media,{method:"HEAD",redirect:"error",signal:AbortSignal.timeout(9000)});
  const size=Number(r.headers.get("content-length")||0);
  return r.ok&&String(r.headers.get("content-type")||"").includes(type)&&size>30000&&size<30*1024*1024;
 }catch{return false;}
}
const specs:any={
 feed:{table:"giro_publicacoes_feed",idField:"instagram_media_id",version:6,state:"feed_ilustracao_revisada",format:"feed",asset:"feed_image_url"},
 reels:{table:"giro_publicacoes_reels",idField:"instagram_reel_media_id",version:5,state:"reel_ilustracao_revisada",format:"reels",asset:"video_url"},
 stories:{table:"giro_publicacoes_stories",idField:"instagram_story_media_id",version:5,state:"stories_ilustracao_revisada",format:"stories",asset:"story_image_url"}
};
Deno.serve(async req=>{
 if(req.method!=="POST")return respond({success:false,error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)return respond({success:false,error:"missing_configuration"},503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 const token=req.headers.get("x-giro-db-key")||"";
 const auth=await db.rpc("validar_giro_dispatch_key",{p_key:token});
 if(!token||auth.error||auth.data!==true)return respond({success:false,error:"unauthorized"},401);
 const args=await req.json().catch(()=>({}));const dry=args.dry_run===true;
 const channels=String(args.channel||"") in specs?[String(args.channel)]:["feed","reels","stories"];
 const results:any[]=[];const now=Date.now();
 const local=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Porto_Velho",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})
   .formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const nextWindow=(channel:string)=>{
   const start:any={feed:[12,0],reels:[13,30],stories:[15,30]};
   const [hour,minute]=start[channel];
   const slot=Date.UTC(Number(local.year),Number(local.month)-1,Number(local.day),hour+4,minute);
   return slot<now-44*60000?slot+86400000:slot;
 };
 for(const channel of channels){
  const spec=specs[channel];
  // No stale approval today that would become tomorrow's expired news.
  const minExpiry=Math.max(now+20*60000,nextWindow(channel)+45*60000);
  const {data,error}=await db.from(spec.table).select("*")
   .eq("status","pendente").eq("visual_approved",false)
   .is(spec.idField,null).gte("created_at",new Date(now-30*3600000).toISOString())
   .gt("editorial_expires_at",new Date(minExpiry).toISOString())
   .order("created_at",{ascending:false}).limit(5);
  if(error){results.push({channel,status:"error",reason:"queue_read_failed"});continue;}
  for(const item of data||[]){
    const hold=(reason:string)=>results.push({channel,id:item.id,status:"held",reason});
    const day=(v:string|number|Date)=>new Intl.DateTimeFormat("en-CA",{
      timeZone:"America/Porto_Velho",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date(v));
    const timeSensitive=/\b(?:tempo|previs[aã]o|chuva|tempestade|hoje|neste|nesta|domingo|segunda-feira|ter[cç]a-feira|quarta-feira|quinta-feira|sexta-feira|s[aá]bado)\b/i;
    if(day(String(item.created_at))!==day(nextWindow(channel))&&timeSensitive.test(String(item.titulo||""))){
      hold("calendar_sensitive_article_not_valid_for_next_posting_day");continue;
    }
    const hasIllustration=String(item.legenda||"").includes("ILUSTRAÇÃO EDITORIAL ORIGINAL")&&
     String(item.legenda||"").includes("NÃO É FOTO DO ACONTECIMENTO");
    // An original factual news card contains no third-party event photograph.
    // It may be machine-reviewed only after its caption is grounded in the
    // source, the media is served from our own channel-specific storage,
    // and it clearly says it is NOT a photograph of the event.
    // Photos themselves still require event-specific rights verification.
    if(!hasIllustration){hold("requires_photo_rights_or_factual_card_label");continue;}
    const expectedUrl="Matéria original: "+String(item.fonte_url||"");
    if(item.media_pipeline_version!==spec.version||!hasIllustration||
      !String(item.legenda||"").includes(expectedUrl)||
      !String(item.legenda||"").includes("Fonte: ") ||
      !["aguardando_revisao_visual","feed_pronto","aguardando_reel"].includes(String(item.media_status||""))){
      hold("trusted_abstract_art_contract_missing");continue;
    }
    if(channel==="reels"&&(item.publicar_reel!==true||item.publicar_story===true)){
      hold("independent_reels_contract_missing");continue;
    }
    if(channel==="stories"&&item.publicar_story!==true){hold("story_not_authorized");continue;}
    const base="/storage/v1/object/public/";
    const prefix=channel==="reels"?base+"news-videos/auto/reels/reels/":
      base+"news-images/auto/jpeg/"+channel+"/"+(channel==="feed"?"feed/":"story/");
    const asset=String(item[spec.asset]||"");
    if(!await validAsset(url,asset,prefix,channel==="reels"?"video/mp4":"image/jpeg")){
      hold("channel_specific_media_invalid");continue;
    }
    const check=await sourceCheck(item);
    if(!check.ok){hold(check.reason);continue;}
    if(dry){results.push({channel,id:item.id,status:"eligible",reason:"machine_verified_factual_news_card"});continue;}
    const {data:updated,error:ue}=await db.from(spec.table).update({
      status:"aprovada",visual_approved:true,media_status:spec.state,
      auto_review_basis:"machine_verified_original_factual_card_v2",
      auto_review_at:new Date().toISOString(),
      scheduled_at:new Date().toISOString(),erro:null
    }).eq("id",item.id).eq("status","pendente").eq("visual_approved",false)
      .eq("media_pipeline_version",spec.version).is(spec.idField,null)
      .gt("editorial_expires_at",new Date(minExpiry).toISOString()).select("id").maybeSingle();
    if(ue||!updated){hold("database_approval_conflict");continue;}
    results.push({channel,id:item.id,status:"approved",reason:"machine_verified_original_factual_card_v2"});
  }
 }
 return respond({success:true,dry_run:dry,results,public_posts_attempted:false});
});
