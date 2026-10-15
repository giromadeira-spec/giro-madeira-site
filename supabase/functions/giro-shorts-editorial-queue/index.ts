import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const resp=(o:unknown,s=200)=>new Response(JSON.stringify(o),{status:s,headers});
const normalize=(s:unknown)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();

// Exclusive editorial scope for Shorts: national Brazilian and world news.
// Local reporting is reserved for the independent Instagram radars.
const localRegion=/\b(rondonia|porto velho|ji parana|ariquemes|vilhena|cacoal|guajara mirim|jaru|rolim de moura|pimenta bueno|candeias do jamari|machadinho do oeste|ouro preto do oeste|buritis|alto paraiso|presidente medici|espigao do oeste|em ro)\b/;
const nationwideScope=/\b(em todo o brasil|em todo o pais|no pais inteiro|em todo territorio nacional|nacional|nacionais|brasileiros|brasileiras|rodovias federais|brasil|governo federal|congresso nacional|senado federal|supremo tribunal federal|stf|tse|banco central|copom|selic|receita federal|presidente da republica|reforma tributaria|bolsa familia|pix|imposto de renda|policia federal|pf|prf)\b/;
const foreignScope=/\b(russia|ucrania|israel|ira|gaza|eua|estados unidos|china|mexico|nepal|paquistao|reino unido|africa|india|franca|alemanha|argentina|japao|sudao|libano|arabia saudita|coreia do sul|onu|uniao europeia|otan|guerra mundial)\b/;
function scopeOf(v:{titulo:string;fonte_nome:string;fonte_url:string}):"brasil"|"mundo"|"rondonia"|null{
 const t=normalize(v.titulo),src=normalize(v.fonte_nome),link=String(v.fonte_url||"").toLowerCase();
 if(localRegion.test(t) && !/\b(em todo o brasil|em todo o pais|todo territorio nacional|rodovias federais)\b/.test(t))return "rondonia";
 if(/\/(mundo|internacional|world|global)\//.test(link) || foreignScope.test(t)
   || /^(deutsche welle|dw brasil|onu news|un news|reuters|bbc mundo|bbc news brasil mundo)$/.test(src))return "mundo";
 if(nationwideScope.test(t))return "brasil";
 if(/\/ro\/rondonia\/|\.ro\.gov\.br/.test(link) ||
    /^(rondonia ao vivo|rondoniagora|g1 rondonia|portal jipa|tudo rondonia|sictv|ge rondonia|news rondonia|rondonia dinamica)$/.test(src))return "rondonia";
 if(/^(g1 brasil|forbes brasil|senado federal|agencia brasil)$/.test(src)
   || /g1\.globo\.com\/(politica|economia|brasil)\//.test(link))return "brasil";
 return null;
}
const blocked = (title:string,source:string,url:string) => {
 const t=normalize(title),s=normalize(source);
 if(!title||title.length<28||title.length>160)return true;
 if(/news rondonia/.test(s)&&/\b(convida|recebe|entrevista|apresenta|podcast|ao vivo)\b/.test(t))return true;
 if(/\b(requerimento de licenca|licenca ambiental|edital|processo seletivo da empresa|assine|anuncie|publicidade|classificados|avisos legais|nota de falecimento|patrocinado)\b/.test(t))return true;
 if(/^(leia|assista|saiba mais|confira|veja|receba|acompanhe)\b/.test(t))return true;
 try {
   const u=new URL(url);
   if(u.protocol!=="https:")return true;
   if(/\/(tags?|autores?|busca|pesquisa|search|newsletter|sobre|category)\/?$/.test(u.pathname))return true;
   // Reject URLs carrying an old dated story, even if syndicated today.
   const p=u.pathname.match(/\/(20\d{2})\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/|$)/);
   if(p){
     const day=Date.UTC(+p[1],+p[2]-1,+p[3],12);
     if(Number.isFinite(day) && Math.abs(Date.now()-day)>4*86400000)return true;
   }
 }catch{return true}
 return false;
};
// Slots follow Brasilia (BRT) time. These are editorial planning targets, NOT uploads.
// Local news and sports are prioritized but not fabricated when no usable story exists.
const slots=[
 {h:8,m:0,scope:"brasil"},{h:9,m:30,scope:"mundo"},
 {h:11,m:0,scope:"brasil"},{h:12,m:30,scope:"mundo"},
 {h:14,m:0,scope:"brasil"},{h:15,m:30,scope:"mundo"},
 {h:17,m:0,scope:"brasil"},{h:18,m:30,scope:"rondonia"},
 {h:20,m:0,scope:"mundo"},{h:21,m:30,scope:"brasil"}
] as const;
// Classify sport by the actual subject or a sports editorial path, not by a potentially wrong category label.
const isSports=(c:{titulo:string;fonte_url:string;categoria?:string|null}) => {
 const t=normalize(c.titulo),link=String(c.fonte_url||"").toLowerCase();
 return /\b(futebol|futsal|brasileirao|libertadores|copa do brasil|copa do mundo|champions league|europa league|liga dos campeoes|estadual|selecao brasileira|atleta|campeonato|gol|maratona|corrida de rua|basquete|voleibol|formula 1|messi|flamengo|palmeiras|corinthians|botafogo|vinicius junior|vini jr|rodrygo|raphinha|endrick|neymar|estevao|gabriel martinelli|gabriel jesus|alisson|casemiro|richarlison|carlos augusto|matheus cunha)\b/.test(t) || /\/(?:esportes?|futebol|futsal)\//.test(link);
};
// Headline/category classification is an editorial signal, never a replacement for
// source verification. Sports get their own late-night bonus, not a regular slot.
const isPolitics=(c:{titulo:string;fonte_url:string;categoria?:string|null})=>{
 const t=normalize(c.titulo),cat=normalize(c.categoria);
 const link=String(c.fonte_url||"").toLowerCase();
 return !isSports(c) && (cat==="politica" ||
   /\/(?:politica|eleicoes|eleitoral)\//.test(link) ||
   /\b(eleicao|eleicoes|eleitoral|tse|tre|governo|governador|prefeito|prefeitura|senado|senador|senadora|deputado|deputada|presidente|presidencia|ministro|ministra|congresso|assembleia legislativa|votacao|votos|campanha eleitoral|stf)\b/.test(t));
};
const isPolice=(c:{titulo:string;fonte_url:string;categoria?:string|null})=>{
 const t=normalize(c.titulo),cat=normalize(c.categoria);
 const link=String(c.fonte_url||"").toLowerCase();
 const criminal=/\b(policia|policial|pf|prf|pm|operacao policial|prisao|prisoes|preso|presa|prende|prendem|detido|detida|investigacao criminal|homicidio|assassinato|trafico de drogas|apreensao|apreende|roubo|assalto|feminicidio|mandado de prisao|foragido|facção|faccao)\b/.test(t);
 // Electoral investigations remain a politics story unless a concrete criminal action is the subject.
 if(isPolitics(c) && !/\b(prisao|prisoes|preso|presa|prende|homicidio|assassinato|trafico de drogas|roubo|assalto)\b/.test(t))return false;
 return !isSports(c) && (cat==="policia" || /\/(?:policia|seguranca-publica)\//.test(link) || criminal);
};
const isHighImpact=(c:{titulo:string;fonte_url:string;categoria?:string|null;urgente?:boolean|null})=>{
 const t=normalize(c.titulo),cat=normalize(c.categoria);
 return !!c.urgente || ["tecnologia","economia","saude","policia","politica"].includes(cat) ||
   /\b(acidente|colisao|atropelamento|incendio|explosao|enchente|alagamento|temporal|deslizamento|interdicao|alerta|apagao|falta de agua|falta de energia|suspensao|emergencia|hospitais|hospital|saude|vacina|tecnologia|inteligencia artificial|celular|internet|golpe digital|dados pessoais|salario|imposto|inflacao|precos|emprego|desemprego|investigacao|investiga|prisao|prende|votacao|eleicao|governo)\b/.test(t);
};
const editorialScore=(c:{titulo:string;fonte_nome:string;fonte_url:string;categoria?:string|null;urgente?:boolean|null},
  target:"policial"|"politica"|"rondonia"|"em_alta")=>{
 const local=scopeOf(c)==="rondonia",police=isPolice(c),politics=isPolitics(c);
 let score=(c.urgente?15:0)+(local?9:0)+(isHighImpact(c)?7:0)+(police?4:0)+(politics?4:0);
 if(target==="policial"&&police)score+=40;
 if(target==="politica"&&politics)score+=40;
 if(target==="rondonia"&&local)score+=40;
 if(target==="em_alta"&&isHighImpact(c))score+=25;
 return score;
};
// Match-result eligibility requires a score and post-match language; a fixture is NOT a result.
const hasFinalFootballScore=(c:{titulo:string;resumo?:string|null;legenda?:string|null;fonte_url:string;categoria?:string|null})=>{
 const title=normalize(c.titulo);
 const story=normalize([c.titulo,c.resumo,c.legenda].filter(Boolean).join(" "));
 const path=String(c.fonte_url||"").toLowerCase();
 const football=/\b(brasileirao|serie a|serie b|libertadores|sul americana|copa do brasil|copa do mundo|champions league|liga dos campeoes|europa league|estadual|paulistao|carioca|mineiro|gaucho|futebol|soccer|palmeiras|flamengo|corinthians|santos|sao paulo|botafogo|fluminense|vasco|gremio|internacional|cruzeiro|atletico mg|bahia|fortaleza|vitoria|real madrid|barcelona|arsenal|liverpool|psg|bayern|milan|juventus|manchester|vinicius junior|vini jr|rodrygo|raphinha|endrick|neymar)\b/.test(story)
   || /\/(futebol|soccer|libertadores|champions|esportes)\//.test(path);
  const original=[c.titulo,c.resumo,c.legenda].filter(Boolean).join(" ");
  const score=/(?:^|[^\d])(?:[0-9]|1[0-9])\s*(?:x|a|[-–])\s*(?:[0-9]|1[0-9])(?=$|[^\d])/i.test(original);
 const final=/\b(vence|venceu|vencem|venceram|derrota|derrotou|goleia|goleou|empata|empatou|empataram|perde|perdeu|perderam|eliminou|elimina|avancou|classificou|vit[oó]ria|placar final|fim de jogo|terminou|encerrada|rodada terminou|resultados da rodada|marcou|marca|brilhou|brilha|decisivo|hat trick|assistencias|dois gols|tres gols)\b/.test(story);
 const stillRunning=/\b(ao vivo|tempo real|parcial|primeiro tempo|intervalo de jogo|em andamento)\b/.test(title);
 return football && score && final && !stillRunning;
};
// Assemble a roundup ONLY from independent, published match reports with explicit final scores.
// All facts remain attributable to the corresponding original source URL in the caption.
const footballScore=(c:{titulo:string;resumo?:string|null;legenda?:string|null})=>{
 const m=[c.titulo,c.resumo,c.legenda].filter(Boolean).join(" ")
   .match(/(?:^|[^\d])([0-9]|1[0-9])\s*(?:x|a|[-–])\s*([0-9]|1[0-9])(?=$|[^\d])/i);
 return m ? m[1]+" x "+m[2] : null;
};
const roundDigest=(items:any[])=>{
 const chosen:any[]=[];
 const factualVerb=/(?:^|\s)(vence|venceu|goleia|goleou|empatou|empata|perdeu|derrotou|eliminou|classificou|avancou|marca|marcou|brilhou|brilha|terminou|vitoria)(?=\s|$)/;
 for(const item of items){
   const score=footballScore(item);
   if(!score)continue;
   const raw=String(item.titulo||"").split("|")[0].trim().replace(/[.!?]+$/,"");
   const statement=/(?:^|[^\d])(?:[0-9]|1[0-9])\s*(?:x|a|[-–])\s*(?:[0-9]|1[0-9])(?:$|[^\d])/i.test(raw)
      ?raw+".":raw+"; placar final: "+score+".";
   if(statement.length<30||statement.length>108||!factualVerb.test(normalize(raw)))continue;
   if(chosen.some(other=>other.fonte_url===item.fonte_url||sameStory(other.titulo,item.titulo)))continue;
   chosen.push({...item,statement});
   if(chosen.length===3)break;
 }
 return chosen.length===3?chosen:null;
};
const uniqueFootballReports=(items:any[])=>{
 const accepted:any[]=[];
 for(const item of items){
   if(!hasFinalFootballScore(item))continue;
   if(accepted.some(prev=>prev.fonte_url===item.fonte_url||sameStory(prev.titulo,item.titulo)))continue;
   accepted.push(item);
 }
 return accepted;
};
const startOfBRTDay=()=>{
 const d=new Date(), parts= new Intl.DateTimeFormat("en-US",{
 timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return Date.UTC(Number(obj.year),Number(obj.month)-1,Number(obj.day),3,0,0);
};
function similarity(a:string,b:string){
 const ta=new Set(normalize(a).split(" ").filter(s=>s.length>3));
 const tb=new Set(normalize(b).split(" ").filter(s=>s.length>3));
 const overlap=[...ta].filter(t=>tb.has(t)).length;
 return overlap/Math.max(1,ta.size+tb.size-overlap);
}
// Protect against syndicated coverage of the *same* story under different titles
// or URLs, not against genuinely new developments on an ongoing topic.
const commonHeadlineTerms=new Set(["brasil","brasileiros","brasileiras","governo","nacional","hoje","amanha","depois","sobre","outras","outros","noticia","noticias","apos","maior","menor","tarde","ainda","pode","podem","esta","estao","para","entre","contra","quase","mais"]);
const headlineTerms=(s:string)=>new Set(normalize(s).split(" ")
  .filter(w=>w.length>=5 && !commonHeadlineTerms.has(w)));
function sameStory(a:string,b:string){
 if(similarity(a,b)>=0.49)return true;
 const ta=headlineTerms(a),tb=headlineTerms(b);
 const shared=[...ta].filter(w=>tb.has(w)).length;
 return shared>=4 && shared/Math.max(1,Math.min(ta.size,tb.size))>=0.7;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return resp({success:false,error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service)return resp({success:false,error:"supabase_config_missing"},503);
 const token=req.headers.get("x-giro-db-key")||"";
 if(!token)return resp({success:false,error:"unauthorized"},401);
 const sb=createClient(url,service,{auth:{persistSession:false}});
 const vr=await sb.rpc("validar_giro_dispatch_key",{p_key:token});
 if(vr.error||vr.data!==true)return resp({success:false,error:"unauthorized"},401);
 try{
   const settings=await sb.from("giro_shorts_settings")
      .select("editorial_queue_enabled,daily_goal,visual_template_version,private_auto_uploads_enabled,public_auto_uploads_enabled,football_bonus_enabled,football_bonus_max,football_bonus_min_confirmed")
      .eq("id","giro_madeira").single();
   if(settings.error)throw settings.error;
   const args=await req.json().catch(()=>({}));
   const lane=await sb.from('giro_channel_settings').select('preparation_enabled').eq('channel','shorts').single();
   if(lane.error)throw lane.error;
   if(args.dry_run===true||!lane.data.preparation_enabled)return resp({success:true,dry_run:args.dry_run===true,no_publish:true,channel:'shorts',preparation_enabled:lane.data.preparation_enabled,daily_goal:settings.data.daily_goal});

   if(!settings.data.editorial_queue_enabled)return resp({success:true,enabled:false});
   // Cada pauta recebe 24h COMPLETAS depois do horario agendado; um Short das
   // 22h nunca deve expirar so porque virou meia-noite em Porto Velho.
   // O planejamento da proxima programacao ja acontece diariamente em paralelo.
   const expirationCutoff=new Date(Date.now()-24*60*60*1000).toISOString();
   const {data:expired,error:expireError}=await sb.from("giro_social_video_queue")
     .update({
       status:"expirado",
       last_error:"Ciclo editorial de 24 horas encerrado; item não publicado e preservado no histórico.",
       updated_at:new Date().toISOString()
     })
     .eq("platform","youtube_shorts")
     .in("status",["aguardando_video","pronto_para_revisao"])
     .is("provider_post_id",null)
     .lt("scheduled_for",expirationCutoff)
     .select("id");
   if(expireError)throw expireError;
   const start=startOfBRTDay(),end=start+86400000;
   // Porto Velho editorial targets: 07h police, 10h politics, 13h police,
   // 17h30 Rondônia / public safety alerts, 20h30 major national or local news.
   // These are priorities, not fixed quotas: never force unverified/stale stories.
   const pilotSlots: Array<{h:number,m:number,scope:"policial"|"politica"|"rondonia"|"em_alta"}> = [
     {h:8,m:0,scope:"policial"},
     {h:11,m:0,scope:"politica"},
     {h:14,m:0,scope:"policial"},
     {h:18,m:30,scope:"rondonia"},
     {h:21,m:30,scope:"em_alta"}
   ];
   // Estrategia de 2 Shorts: 08h e 22h de Porto Velho (09h e 23h BRT).
   // Apenas noticias nacionais/mundiais de alto impacto; sem preencher vaga com esportes ou rotina.
   const twoDailySlots=[{h:9,m:0,scope:"em_alta"},{h:23,m:0,scope:"em_alta"}] as const;
   const baseSlots=twoDailySlots; // Exclusive 08:00/22:00 Porto Velho, no extra slots.
   const {data:queued,error:qerr}=await sb.from("giro_social_video_queue")
     .select("source_id,source_url,title,scheduled_for,topic_scope,football_extra").eq("platform","youtube_shorts").neq("status","expirado")
     .gte("created_at",new Date(start).toISOString()).lt("created_at",new Date(end).toISOString());
   if(qerr)throw qerr;
   // Read previous Shorts from the last 7 days, including private test uploads.
   // Avoid scheduling the same news again from a different syndication source.
   const {data:recent,error:recentError}=await sb.from("giro_social_video_queue")
     .select("source_id,source_url,title")
     .eq("platform","youtube_shorts")
     .gte("created_at",new Date(Date.now()-7*86400000).toISOString())
     .order("created_at",{ascending:false}).limit(500);
   if(recentError)throw recentError;
   let count=(queued||[]).length;
   const todayBySlot=new Set((queued||[]).map(x=>x.scheduled_for).filter(Boolean));
   const seenUrls=new Set((recent||[]).map(x=>x.source_url).filter(Boolean));
   const seenSourceIds=new Set((recent||[]).map(x=>x.source_id).filter(Boolean));
   const seenTitles=(recent||[]).map(x=>String(x.title||""));
   // Shorts is a standalone editorial production lane: source = Radar, never Instagram/publicacoes.
   // Its storyboard, licensed art, MP4 rendering and YouTube upload are handled separately.
   const [candidates,fontes]=await Promise.all([
     sb.from("giro_radar_shorts")
       .select("id,fonte_id,titulo,url,score,urgente,created_at,source_published_at,status")
       .gte("created_at",new Date(Date.now()-36*3600000).toISOString())
       .gte("score",25).order("score",{ascending:false}).limit(450),
     sb.from("giro_madeira_fontes").select("id,nome")
   ]);
   if(candidates.error)throw candidates.error;
   if(fontes.error)throw fontes.error;
   const sourceNames=new Map((fontes.data||[]).map(f=>[String(f.id),String(f.nome||"")]));
   const options=(candidates.data||[]).map(c=>({
     id:c.id,titulo:c.titulo,fonte_nome:sourceNames.get(String(c.fonte_id))||"",
     fonte_url:c.url,categoria:"",legenda:"",resumo:"",video_url:null,
     urgente:c.urgente,created_at:c.created_at,source_published_at:c.source_published_at,
     score:c.score,status:c.status
   })).filter(c=>
     (!c.source_published_at || Date.parse(c.source_published_at)>=Date.now()-48*3600000) &&
     !blocked(String(c.titulo),String(c.fonte_nome),String(c.fonte_url)) &&
     (["brasil","mundo"].includes(String(scopeOf({titulo:c.titulo,fonte_nome:c.fonte_nome,fonte_url:c.fonte_url}))))
   );
   const finishedReports=uniqueFootballReports(options);
   // One football roundup at 22h Porto Velho (23h BRT) only when
   // multiple independent reports confirm final match scores.
   const extraCount=false && settings.data.football_bonus_enabled===true
      ?Math.min(1,settings.data.football_bonus_max||0,
          Math.floor(finishedReports.length/Math.max(2,settings.data.football_bonus_min_confirmed||2)))
      :0;
   const bonusSlots=extraCount>0?[{h:23,m:0,scope:"esporte",footballExtra:true}]:[];
   const daySlots=[...baseSlots.map(s=>({...s,footballExtra:false})),...bonusSlots]
     .sort((a,b)=>(a.h*60+a.m)-(b.h*60+b.m));
   const created:any[]=[];
   const slotDiagnostics:any[]=[];
   const targetMax=Math.min(daySlots.length,settings.data.daily_goal+extraCount);
   for(const slot of daySlots){
     if(count>=targetMax)break;
     const scheduled=new Date(start+(slot.h*60+slot.m)*60000).toISOString();
     if(todayBySlot.has(scheduled))continue;
     // Do not schedule news retrospectively beyond two hours.
     if(new Date(scheduled).getTime()<Date.now())continue;
     // Last football slot may be a genuine multi-match roundup rather than an
     // unrelated individual story. 3 verified results -> 3 scenes/3 source links.
     if(slot.footballExtra && slot.h===23 && finishedReports.length>=3){
       const digest=roundDigest(finishedReports);
       if(digest){
         const dateBRT=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit"}).format(new Date());
         const roundupTitle="Futebol: Giro dos placares - atualização "+dateBRT;
         const citations=digest.map((a,i)=>String(i+1)+". "+a.titulo+"\nFonte: "+a.fonte_url).join("\n\n");
         const extra=await sb.from("giro_social_video_queue").insert({
           source_kind:"radar",source_id:String(digest[0].id),platform:"youtube_shorts",
           topic_scope:"brasil",title:roundupTitle,caption:citations.slice(0,2200),
           source_url:digest[0].fonte_url,video_url:null,
           scene_cards:digest.map(a=>a.statement),storyboard_status:"preparado",
           status:"pronto_para_revisao",editor_approved:false,visual_review_status:"pending",
           football_extra:true,scheduled_for:scheduled
         }).select("id,title,scheduled_for,topic_scope").maybeSingle();
         if(extra.error)throw extra.error;
         if(extra.data){
           created.push(extra.data);count++;todayBySlot.add(scheduled);
           seenTitles.push(roundupTitle);
           continue;
         }
       }
     }
     const unused=options.filter(c=>
       !seenUrls.has(c.fonte_url) && !seenSourceIds.has(String(c.id)) &&
       !seenTitles.some(t=>sameStory(t,c.titulo)) &&
       !created.some(v=>sameStory(v.title,c.titulo))
     );
     const wanted=(c:typeof options[number])=>
       slot.footballExtra?hasFinalFootballScore(c):
       slot.scope==="policial"?isPolice(c):
       slot.scope==="politica"?isPolitics(c):
       slot.scope==="rondonia"?(scopeOf(c)==="rondonia"&&!isSports(c)):
       slot.scope==="em_alta"?(isHighImpact(c)&&!isSports(c)):
       false;
     // Strongest verified story in target category wins; use other relevant
     // non-sports news if a target is unavailable. Never force football here.
     const rank=(a:typeof options[number],b:typeof options[number])=>
       (editorialScore(b,slot.scope as "policial"|"politica"|"rondonia"|"em_alta")-
        editorialScore(a,slot.scope as "policial"|"politica"|"rondonia"|"em_alta"));
     const preferred=unused.filter(c=>wanted(c) && (settings.data.daily_goal>2 || isHighImpact(c) && !isSports(c))).sort(rank);
     const fallback=unused.filter(c=>!isSports(c) && (settings.data.daily_goal>2 || isHighImpact(c))).sort(rank);
     const match=slot.footballExtra?preferred[0]:(preferred[0]||fallback[0]);
     slotDiagnostics.push({slot:scheduled,unused:unused.length,preferred:preferred.length,fallback:fallback.length,selected:!!match});
     if(!match)continue;
     const inserted=await sb.from("giro_social_video_queue").insert({
       source_kind:"radar",source_id:String(match.id),
       platform:"youtube_shorts",topic_scope:scopeOf(match)||"brasil",
       title:String(match.titulo).slice(0,180),
       caption:String(match.legenda||match.resumo||"").slice(0,2200),
       source_url:match.fonte_url,video_url:null,
       status:"pronto_para_revisao",editor_approved:false,visual_review_status:"pending",
       football_extra:slot.footballExtra===true,scheduled_for:scheduled
     }).select("id,title,scheduled_for,topic_scope").maybeSingle();
     if(inserted.error){
       if(inserted.error.code==="23505")continue;
       throw inserted.error;
     }
     if(inserted.data){
       created.push(inserted.data); count++;
       seenUrls.add(match.fonte_url);seenSourceIds.add(String(match.id));seenTitles.push(match.titulo);
       todayBySlot.add(scheduled);
     }
   }
   return resp({success:true,mode:"automatic_editorial_queue_only",daily_goal:settings.data.daily_goal,
    football_bonus:extraCount,football_results_verified:finishedReports.length,effective_goal:targetMax,
    radar_candidates:(candidates.data||[]).length,eligible_candidates:options.length,slot_diagnostics:slotDiagnostics,
    queued_new:created,expired_previous_cycle:(expired||[]).length,previous_today:(queued||[]).length,total_today:count,
    automatic_uploads_enabled:settings.data.public_auto_uploads_enabled===true,
    public_uploads_enabled:settings.data.public_auto_uploads_enabled===true,
    note:"Fila editorial apenas: publicar exige aprovação, render verificado e controles da função de upload."});
 }catch(e){
   console.error("giro shorts plan failed",e instanceof Error?e.name:"error");
   return resp({success:false,error:"shorts_editorial_queue_error"},500);
 }
});
