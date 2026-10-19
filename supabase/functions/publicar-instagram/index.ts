import { createClient } from "npm:@supabase/supabase-js@2";

const H = {"Content-Type":"application/json"};
const REFRESH_AFTER_DAYS = 25;
const RATE_TABLE = "giro_meta_rate_state";
const STATE_ID = 1;
const SOFT_USAGE = 70;
const EXTRAS_PAUSE_USAGE = 85;
const HARD_USAGE = 95;
const QUOTA_CACHE_MINUTES = 10;
// Keep Instagram Feed, Story, and Reel at least 5 minutes apart after each confirmed publication.
const MIN_INSTAGRAM_PUBLISH_GAP_MS = 5*60*1000;

type MediaType = "IMAGE" | "REELS" | "STORIES";

function cleanError(data:any){
  const e=data?.error??data;
  return {
    message:e?.message??String(e??"Erro desconhecido"),
    type:e?.type??null,
    code:e?.code??null,
    error_subcode:e?.error_subcode??null,
    is_transient:e?.is_transient??null,
    error_user_title:e?.error_user_title??null,
    error_user_msg:e?.error_user_msg??null,
    fbtrace_id:e?.fbtrace_id??null
  };
}

function asJson(s:string|null){
  if(!s)return {};
  try{return JSON.parse(s)}catch{return {}}
}

function walkNumbers(v:any, keys:Set<string>, out:number[]=[]):number[]{
  if(Array.isArray(v)){for(const x of v)walkNumbers(x,keys,out);return out}
  if(v&&typeof v==="object"){
    for(const [k,x] of Object.entries(v)){
      if(keys.has(k)&&typeof x==="number"&&Number.isFinite(x))out.push(x);
      walkNumbers(x,keys,out);
    }
  }
  return out;
}

function usagePercent(app:any,buc:any){
  const vals=[
    ...walkNumbers(app,new Set(["call_count","call_volume","cpu_time","total_time","total_cputime"])),
    ...walkNumbers(buc,new Set(["call_count","call_volume","cpu_time","total_time","total_cputime"]))
  ];
  return vals.length?Math.max(...vals):0;
}

function regainMinutes(buc:any){
  const vals=walkNumbers(buc,new Set(["estimated_time_to_regain_access"]));
  return vals.length?Math.max(...vals):0;
}

function isoAfter(minutes:number){
  return new Date(Date.now()+Math.max(1,minutes)*60000).toISOString();
}

function metaErrorKind(data:any,status:number){
  const e=data?.error??data??{},sub=Number(e?.error_subcode??0),code=Number(e?.code??0);
  const msg=String(e?.message??"").toLowerCase();
  if(sub===2207051||sub===2207050)return "integrity";
  if(sub===2207042||(code===9&&/publish|post|quota/.test(msg)))return "publishing_quota";
  if(status===429||[4,17,32,613,80002].includes(code)||/application request limit|request limit reached|rate limit|too many actions|quota|try again later/.test(msg))return "rate_limit";
  return "other";
}
function safeMetaError(data:any,status:number,stage:string){
  const e=cleanError(data);
  return {stage,http_status:status,code:e.code,error_subcode:e.error_subcode,
    type:String(e.type??"").slice(0,80),message:String(e.message??"").slice(0,500),
    is_transient:e.is_transient,error_user_title:String(e.error_user_title??"").slice(0,200),
    error_user_msg:String(e.error_user_msg??"").slice(0,500),
    fbtrace_id:String(e.fbtrace_id??"").slice(0,100),
    kind:metaErrorKind(data,status)};
}
function isRateLimitError(data:any,status:number){
  const e=data?.error??data??{};
  const msg=JSON.stringify(data??{}).toLowerCase();
  const code=Number(e?.code??0);
  return metaErrorKind(data,status)!=="other" || status===429 || [4,17,32,613].includes(code) ||
    /application request limit|request limit reached|rate limit|too many actions|quota|try again later/.test(msg);
}

async function saveMetaUsage(sb:any,r:Response,data:any,stage="api"){
  const app=asJson(r.headers.get("x-app-usage")),buc=asJson(r.headers.get("x-business-use-case-usage"));
  const pct=Math.round(usagePercent(app,buc)),regain=Math.ceil(regainMinutes(buc));
  const kind=metaErrorKind(data,r.status),limited=kind!=="other";
  const previous=await getState(sb);
  const patch:any={app_usage:app,business_usage:buc,usage_percent:pct,last_http_status:r.status,updated_at:new Date().toISOString()};
  if(!r.ok){
    patch.last_meta_error=safeMetaError(data,r.status,stage);
    patch.last_meta_error_at=new Date().toISOString();
    patch.last_meta_error_stage=stage;
  }
  if(limited){
    const attempts=Math.max(0,Number(previous?.consecutive_limit_errors??0))+1;
    patch.consecutive_limit_errors=attempts;
    if(kind==="integrity"){
      patch.integrity_hold=true;
      patch.blocked_until=null;
      patch.block_reason="Restrição de integridade/antispam da Meta (subcódigo "+String(data?.error?.error_subcode??"desconhecido")+"); requer revisão.";
    }else{
      const wait=kind==="publishing_quota"?1440:Math.min(360,30*Math.pow(2,Math.min(attempts-1,4)));
      patch.blocked_until=isoAfter(Math.max(regain||0,wait));
      patch.block_reason=kind==="publishing_quota"
        ?"Cota de publicações da conta atingida; aguardando janela móvel."
        :"Meta limitou chamadas; pausa progressiva (ocorrência "+attempts+").";
    }
    console.warn("GIRO_META_DIAGNOSTIC",JSON.stringify(patch.last_meta_error));
  }else if(pct>=HARD_USAGE&&!previous?.integrity_hold){
    patch.blocked_until=isoAfter(15);
    patch.block_reason="Uso da API Meta atingiu "+pct+"%; pausa preventiva.";
  }else if(pct<EXTRAS_PAUSE_USAGE&&!previous?.integrity_hold){
    patch.blocked_until=null;
    patch.block_reason=pct>=SOFT_USAGE
      ?"Uso elevado ("+pct+"%); mantendo cadência reduzida."
      :null;
  }
  const {error}=await sb.from(RATE_TABLE).update(patch).eq("id",STATE_ID);
  if(error)console.warn("GIRO_META_STATE_SAVE_ERROR",String(error.message??"database error"));
  return {app,buc,pct,regain,limited,kind};
}
async function metaFetch(sb:any,input:string,init?:RequestInit,stage="api"){
  const r=await fetch(input,init);
  const data=await r.json().catch(()=>({}));
  const usage=await saveMetaUsage(sb,r,data,stage).catch(()=>({pct:0,regain:0,limited:false}));
  return {r,data,usage};
}

async function getRuntimeToken(sb:any,envToken:string|undefined){
  const {data:rows,error}=await sb.rpc("giro_instagram_token_get");
  if(error)throw error;
  let token=Array.isArray(rows)&&rows[0]?.token?String(rows[0].token):"";
  let updatedAt=Array.isArray(rows)&&rows[0]?.updated_at?String(rows[0].updated_at):null;
  if(!token){
    if(!envToken)throw new Error("Nenhum token do Instagram disponível.");
    const {data:setAt,error:setError}=await sb.rpc("giro_instagram_token_set",{p_token:envToken});
    if(setError)throw setError;
    token=envToken;
    updatedAt=typeof setAt==="string"?setAt:new Date().toISOString();
  }
  return {token,updatedAt};
}

async function refreshAndPersist(sb:any,token:string){
  const refreshUrl=new URL("https://graph.instagram.com/refresh_access_token");
  refreshUrl.searchParams.set("grant_type","ig_refresh_token");
  refreshUrl.searchParams.set("access_token",token);
  const {r,data}=await metaFetch(sb,refreshUrl.toString(),undefined,"token_refresh");
  if(!r.ok||!data?.access_token)return {ok:false,error:cleanError(data)};
  const newToken=String(data.access_token);
  const {error:saveError}=await sb.rpc("giro_instagram_token_set",{p_token:newToken});
  if(saveError)throw saveError;
  return {ok:true,token:newToken,expires_in:data?.expires_in??null};
}

async function getState(sb:any){
  const {data,error}=await sb.from(RATE_TABLE).select("*").eq("id",STATE_ID).maybeSingle();
  if(error)throw error;
  return data??{};
}

async function refreshPublishingQuota(sb:any,token:string,accountId:string,force=false){
  const st=await getState(sb);
  const checked=st?.quota_checked_at?new Date(st.quota_checked_at).getTime():0;
  const fresh=checked>0 && Date.now()-checked<QUOTA_CACHE_MINUTES*60000;
  if(fresh&&!force)return st;
  if(Number(st?.usage_percent??0)>=EXTRAS_PAUSE_USAGE&&!force)return st;

  const q=new URL("https://graph.instagram.com/v26.0/"+accountId+"/content_publishing_limit");
  q.searchParams.set("fields","quota_usage,config");
  q.searchParams.set("access_token",token);
  const {r,data}=await metaFetch(sb,q.toString(),undefined,"quota_check");
  if(r.ok){
    const item=Array.isArray(data?.data)?data.data[0]:null;
    const quotaUsage=Number(item?.quota_usage);
    const quotaTotal=Number(item?.config?.quota_total);
    const quotaDuration=Number(item?.config?.quota_duration);
    if(Number.isFinite(quotaUsage)&&Number.isFinite(quotaTotal)&&quotaTotal>0){
      await sb.from(RATE_TABLE).update({
        quota_usage:quotaUsage,
        quota_total:quotaTotal,
        quota_duration:Number.isFinite(quotaDuration)?quotaDuration:null,
        quota_checked_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      }).eq("id",STATE_ID);
    }
  }
  return await getState(sb);
}

async function incrementQuota(sb:any){
  const st=await getState(sb);
  const q=Number(st?.quota_usage);
  if(Number.isFinite(q)){
    await sb.from(RATE_TABLE).update({quota_usage:q+1,updated_at:new Date().toISOString()}).eq("id",STATE_ID);
  }
}
async function preflight(sb:any,token:string,accountId:string,mediaType:MediaType,refreshQuota=true,manualTest=false){
  let st=await getState(sb);
  // Semáforo editorial centralizado: consulta somente o banco, sem enviar à Meta.
  const {data:semaforo,error:semaforoErro}=await sb.rpc("giro_instagram_semaforo_gate",{p_media_type:mediaType});
  if(semaforoErro||!semaforo||(semaforo.allowed!==true&&!(manualTest&&semaforo.reason==="Fora da janela editorial de Porto Velho (06h às 23h30)."))){
    return {allowed:false,retry_at:semaforo?.retry_at??isoAfter(180),
      reason:semaforoErro?"Semáforo indisponível: bloquear por segurança.":String(semaforo?.reason||"Publicação adiada pelo semáforo."),
      state:st,integrity_hold:st?.integrity_hold===true,semaforo:semaforo?.semaforo??"vermelho"};
  }
  if(st?.integrity_hold===true)return {allowed:false,retry_at:isoAfter(1440),reason:st?.block_reason||"Restrição de integridade Meta requer revisão.",state:st,integrity_hold:true};
  const now=Date.now();
  // A completed post is the reference point; defer before any further Meta API calls.
  // This guard is separate from the deliberate long-term editorial pause and BUC quotas.
  const lastPublished=st?.last_instagram_published_at?Date.parse(st.last_instagram_published_at):0;
  if(Number.isFinite(lastPublished)&&lastPublished>0&&now<lastPublished+MIN_INSTAGRAM_PUBLISH_GAP_MS){
    return {allowed:false,retry_at:new Date(lastPublished+MIN_INSTAGRAM_PUBLISH_GAP_MS).toISOString(),
      reason:"Cadência editorial: intervalo mínimo de 5 minutos entre publicações do Instagram.",state:st};
  }
  const blocked=st?.blocked_until?new Date(st.blocked_until).getTime():0;
  if(blocked>now){
    return {
      allowed:false,
      retry_at:new Date(blocked).toISOString(),
      reason:st?.block_reason||"Meta em pausa preventiva.",
      state:st
    };
  }
  if(Number(st?.usage_percent??0)>=HARD_USAGE){
    const retry=isoAfter(15);
    await sb.from(RATE_TABLE).update({blocked_until:retry,block_reason:"Uso horário da Meta acima de 95%; pausa preventiva.",updated_at:new Date().toISOString()}).eq("id",STATE_ID);
    return {allowed:false,retry_at:retry,reason:"Uso horário da Meta acima de 95%.",state:st};
  }
  if(mediaType!=="IMAGE"&&Number(st?.usage_percent??0)>=EXTRAS_PAUSE_USAGE){
    return {allowed:false,retry_at:isoAfter(15),reason:"Uso da Meta acima de 85%; Story/Reel aguardando para priorizar Feed.",state:st};
  }

  if(refreshQuota)st=await refreshPublishingQuota(sb,token,accountId,false);
  const qUse=Number(st?.quota_usage);
  const qTotal=Number(st?.quota_total);
  if(Number.isFinite(qUse)&&Number.isFinite(qTotal)&&qTotal>0){
    const remaining=qTotal-qUse;
    if(remaining<=0){
      return {allowed:false,retry_at:isoAfter(30),reason:"Cota de publicação das últimas 24h atingida.",state:st};
    }
    if(mediaType!=="IMAGE"&&remaining<=3){
      return {allowed:false,retry_at:isoAfter(30),reason:"Cota de 24h quase no limite; priorizando Feed.",state:st};
    }
  }
  return {allowed:true,state:st};
}

function buildCreateParams(args:{mediaType:MediaType,imageUrl:string,videoUrl:string,caption:string,token:string,shareToFeed:boolean}){
  const p=new URLSearchParams();
  p.set("access_token",args.token);
  if(args.mediaType==="IMAGE"){
    if(!args.imageUrl)throw new Error("IMAGE exige image_url.");
    p.set("image_url",args.imageUrl);
    if(args.caption)p.set("caption",args.caption);
    return p;
  }
  if(args.mediaType==="REELS"){
    if(!args.videoUrl)throw new Error("REELS exige video_url.");
    p.set("media_type","REELS");
    p.set("video_url",args.videoUrl);
    if(args.caption)p.set("caption",args.caption);
    p.set("share_to_feed",args.shareToFeed?"true":"false");
    return p;
  }
  p.set("media_type","STORIES");
  if(args.videoUrl)p.set("video_url",args.videoUrl);
  else if(args.imageUrl)p.set("image_url",args.imageUrl);
  else throw new Error("STORIES exige image_url ou video_url.");
  return p;
}

// A failed publish response does NOT prove a failed publication.
// One read-only lookup, on the authenticated account, prevents false negatives.
async function confirmAmbiguousPublishOnce(token:string,caption:string,mediaType:MediaType,publishStarted:number){
  if(mediaType!=="IMAGE"&&mediaType!=="REELS")return null;
  try{
    const q=new URL("https://graph.instagram.com/v26.0/me/media");
    q.searchParams.set("fields","id,caption,media_type,permalink,timestamp");
    q.searchParams.set("limit","12");
    q.searchParams.set("access_token",token);
    const response=await fetch(q.toString(),{signal:AbortSignal.timeout(11000)});
    if(!response.ok)return null;
    const body=await response.json();
    const normalize=(s:string)=>String(s||"").replace(/\s+/g," ").trim();
    const expected=normalize(caption);
    if(expected.length<60)return null;
    const matched=(Array.isArray(body?.data)?body.data:[]).filter((m:any)=>{
      if(!m?.id||normalize(m.caption)!==expected)return false;
      if(mediaType==="IMAGE"&&m.media_type!=="IMAGE")return false;
      if(mediaType==="REELS"&&m.media_type!=="VIDEO")return false;
      const t=Date.parse(String(m.timestamp||""));
      return Number.isFinite(t)&&t>=publishStarted-120000&&t<=Date.now()+30000;
    });
    return matched.length===1?{id:String(matched[0].id),permalink:String(matched[0].permalink||"")}:null;
  }catch{return null}
}

async function tryCandidate(sb:any,base:string,token:string,accountId:string,mediaType:MediaType,imageUrl:string,videoUrl:string,caption:string,shareToFeed:boolean,manualTest=false){
  let params:URLSearchParams;
  try{
    params=buildCreateParams({mediaType,imageUrl,videoUrl,caption,token,shareToFeed});
  }catch(e){
    return {success:false,terminal:true,diagnostics:[{api:base,stage:"validate",error:cleanError(e instanceof Error?e.message:String(e))}]};
  }

  const create=await metaFetch(sb,base+"/"+accountId+"/media",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:params
  },"container_create");
  if(!create.r.ok||!create.data?.id){
    const rate=isRateLimitError(create.data,create.r.status);
    return {
      success:false,
      terminal:rate,
      rate_limited:rate,
      diagnostics:[{api:base,stage:"create",media_type:mediaType,error:cleanError(create.data)}]
    };
  }

  const containerId=String(create.data.id);
  let ready=false;
  {
    const waits=mediaType==="IMAGE"?[3000,6000,10000]:[20000,40000];
    for(const wait of waits){
      await new Promise(resolve=>setTimeout(resolve,wait));
      const gate=await preflight(sb,token,accountId,mediaType,false,manualTest);
      if(!gate.allowed){
        return {success:false,terminal:true,rate_limited:true,retry_at:gate.retry_at,diagnostics:[{api:base,stage:"pre_publish_gate",error:{message:gate.reason}}]};
      }
      const s=new URL(base+"/"+containerId);
      s.searchParams.set("fields","status_code,status");
      s.searchParams.set("access_token",token);
      const sr=await metaFetch(sb,s.toString(),undefined,"container_status");
      if(!sr.r.ok){
        const rate=isRateLimitError(sr.data,sr.r.status);
        return {success:false,terminal:rate,rate_limited:rate,diagnostics:[{api:base,stage:"container_status",media_type:mediaType,error:cleanError(sr.data)}]};
      }
      const sc=sr.data?.status_code??null;
      if(sc==="FINISHED"){ready=true;break}
      if(sc==="ERROR"||sc==="EXPIRED"){
        return {success:false,terminal:true,diagnostics:[{api:base,stage:"container",media_type:mediaType,error:cleanError(sr.data)}]};
      }
    }
  }

  if(!ready){
    return {
      success:false,
      terminal:true,
      deferred_processing:true,
      retry_at:isoAfter(15),
      diagnostics:[{api:base,stage:"container_timeout",media_type:mediaType,error:{message:"Container ainda está processando; nova tentativa será feita sem pressionar a API."}}]
    };
  }

  const gate=await preflight(sb,token,accountId,mediaType,false,manualTest);
  if(!gate.allowed){
    return {success:false,terminal:true,rate_limited:true,retry_at:gate.retry_at,diagnostics:[{api:base,stage:"publish_gate",error:{message:gate.reason}}]};
  }

  const publishStarted=Date.now();
  let pub=await metaFetch(sb,base+"/"+accountId+"/media_publish",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({creation_id:containerId,access_token:token})
  },"media_publish");
  // Reuse the SAME creation_id if Meta says the container is not yet available.
  // Never create a second container to recover from this transient condition.
  for(let attempt=0;attempt<2&&(!pub.r.ok||!pub.data?.id);attempt++){
    const msg=String(pub.data?.error?.message??"").toLowerCase();
    if(!/media id is not available|media.*not available/.test(msg))break;
    await new Promise(resolve=>setTimeout(resolve,attempt===0?5000:10000));
    const gateRetry=await preflight(sb,token,accountId,mediaType,false,manualTest);
    if(!gateRetry.allowed)break;
    pub=await metaFetch(sb,base+"/"+accountId+"/media_publish",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({creation_id:containerId,access_token:token})
    },"media_publish_retry");
  }
  if(!pub.r.ok||!pub.data?.id){
    // A provider error can arrive AFTER a successful, visible post (observed 10/10).
    // Do not attempt another upload; reconcile only from the read-only media listing.
    const confirmed=await confirmAmbiguousPublishOnce(token,caption,mediaType,publishStarted);
    if(confirmed){
      await incrementQuota(sb).catch(()=>null);
      const recorded=await sb.rpc("giro_instagram_register_event",{p_media_type:mediaType,p_instagram_media_id:confirmed.id});
      if(recorded.error)console.error("GIRO_SEMAFORO_EVENT_SAVE_FAILED",recorded.error.message);
      // A response saying "blocked" can follow a post Meta actually published.
      // Only clear a hold caused by THIS publish attempt, after a unique,
      // caption-exact, timestamp-bounded readback from the account itself.
      // Holds from other requests, quota checks or older incidents remain.
      const current=await getState(sb);
      const ownHold=current?.integrity_hold===true &&
        current?.last_meta_error?.kind==="integrity" &&
        current?.last_meta_error?.stage==="media_publish" &&
        Number(current?.last_meta_error?.error_subcode)===2207051 &&
        Date.parse(String(current?.last_meta_error_at||""))>=publishStarted-20000;
      if(ownHold){
        const cleared=await sb.from(RATE_TABLE).update({
          integrity_hold:false,blocked_until:null,block_reason:null,
          last_instagram_published_at:new Date().toISOString(),
          consecutive_limit_errors:0,updated_at:new Date().toISOString()
        }).eq("id",STATE_ID).eq("integrity_hold",true)
          .eq("last_meta_error_at",current.last_meta_error_at);
        if(cleared.error)console.error("GIRO_RECONCILED_HOLD_UPDATE_FAILED",cleared.error.message);
      }
      return {success:true,instagram_media_id:confirmed.id,media_type:mediaType,
        api_used:"instagram_readback",reconciled:true,diagnostics:[]};
    }
    const rate=isRateLimitError(pub.data,pub.r.status);
    return {
      success:false,
      terminal:true,
      rate_limited:rate,
      publish_unconfirmed:true,
      creation_id:containerId,
      retry_at:rate?isoAfter(30):null,
      diagnostics:[{api:base,stage:"publish",media_type:mediaType,error:cleanError(pub.data)}]
    };
  }

  await incrementQuota(sb).catch(()=>null);
  const registered=await sb.rpc("giro_instagram_register_event",{
    p_media_type:mediaType,p_instagram_media_id:String(pub.data.id)
  });
  if(registered.error)console.error("GIRO_SEMAFORO_EVENT_SAVE_FAILED",registered.error.message);
  // Persist the actual confirmed media_publish success for all IG media types.
  // Never modify publication_pause_until: an editorial/Meta restriction must remain intact.
  const {error:cadenceError}=await sb.from(RATE_TABLE).update({
    last_instagram_published_at:new Date().toISOString(),
    consecutive_limit_errors:0,blocked_until:null,block_reason:null,updated_at:new Date().toISOString()
  }).eq("id",STATE_ID).eq("integrity_hold",false);
  if(cadenceError)console.error("GIRO_INSTAGRAM_CADENCE_PERSIST_FAILED",String(cadenceError.message??"database error"));
  return {success:true,instagram_media_id:String(pub.data.id),media_type:mediaType,api_used:base,diagnostics:[]};
}

async function tryPublish(sb:any,token:string,accountId:string,mediaType:MediaType,imageUrl:string,videoUrl:string,caption:string,shareToFeed:boolean,manualTest=false){
  const candidates=["https://graph.instagram.com/v26.0","https://graph.facebook.com/v26.0"];
  const diagnostics:any[]=[];
  for(const base of candidates){
    const res:any=await tryCandidate(sb,base,token,accountId,mediaType,imageUrl,videoUrl,caption,shareToFeed,manualTest);
    diagnostics.push(...(res.diagnostics??[]));
    if(res.success)return {...res,diagnostics};
    if(res.rate_limited||res.deferred_processing||res.terminal)return {...res,diagnostics};
  }
  return {success:false,terminal:false,diagnostics};
}

Deno.serve(async(req)=>{
  const url=Deno.env.get("SUPABASE_URL");
  const role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const envToken=Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
  if(!url||!role)return new Response(JSON.stringify({success:false,error:"Configuração Supabase ausente."}),{status:500,headers:H});
  const sb=createClient(url,role);

  try{
    const body=await req.json();
    const manualTest=body?.manual_test===true&&req.headers.get("authorization")==="Bearer "+role&&Date.now()<Date.parse("2026-10-19T04:30:00Z");
    const accountId=String(body?.instagram_account_id??"");
    if(!accountId)return new Response(JSON.stringify({success:false,error:"Envie instagram_account_id."}),{status:400,headers:H});

    // Bloqueio deliberado de publicaçāo ANTES de token/quota/status da Meta.
    const pauseState=await getState(sb);
    const pauseUntil=pauseState?.publication_pause_until?Date.parse(pauseState.publication_pause_until):0;
    if(pauseUntil>Date.now())return new Response(JSON.stringify({
      success:false,deferred:true,rate_guard:true,manual_pause:true,
      error:pauseState?.publication_pause_reason||"Publicação Meta em pausa editorial.",
      retry_at:new Date(pauseUntil).toISOString()
    }),{status:429,headers:H});

    // Consultar semáforo ANTES de renovar token ou acessar a Meta.
    // Ação "status" permanece estritamente consultiva.
    if(String(body?.action??"").toLowerCase()!=="status"){
      const requested=String(body?.media_type??"IMAGE").toUpperCase();
      const requestedType:MediaType=requested==="REELS"?"REELS":requested==="STORIES"?"STORIES":"IMAGE";
      const {data:traffic,error:trafficError}=await sb.rpc("giro_instagram_semaforo_gate",{p_media_type:requestedType});
      if(trafficError||!traffic||(traffic.allowed!==true&&!(manualTest&&traffic.reason==="Fora da janela editorial de Porto Velho (06h às 23h30)."))){
        return new Response(JSON.stringify({success:false,deferred:true,rate_guard:true,
          semaforo:traffic?.semaforo??"vermelho",
          error:trafficError?"Semáforo editorial indisponível; envio suspenso.":traffic?.reason??"Envio suspenso pelo semáforo.",
          retry_at:traffic?.retry_at??null,no_publish:true}),{status:429,headers:H});
      }
    }
    let {token,updatedAt}=await getRuntimeToken(sb,envToken);
    const ageDays=updatedAt?(Date.now()-new Date(updatedAt).getTime())/86400000:999;
    if(ageDays>=REFRESH_AFTER_DAYS){
      const refreshed=await refreshAndPersist(sb,token);
      if(refreshed.ok&&refreshed.token)token=refreshed.token;
    }

    if(String(body?.action??"").toLowerCase()==="status"){
      const state=await refreshPublishingQuota(sb,token,accountId,true);
      return new Response(JSON.stringify({success:true,state}),{status:200,headers:H});
    }

    const imageUrl=String(body?.image_url??"");
    const videoUrl=String(body?.video_url??"");
    const caption=String(body?.caption??"");
    const requestedType=String(body?.media_type??"IMAGE").toUpperCase();
    const shareToFeed=body?.share_to_feed===true;
    const mediaType:MediaType=requestedType==="REELS"?"REELS":requestedType==="STORIES"?"STORIES":"IMAGE";

    if(mediaType==="IMAGE"&&!imageUrl)return new Response(JSON.stringify({success:false,error:"IMAGE exige image_url."}),{status:400,headers:H});
    if(mediaType==="REELS"&&!videoUrl)return new Response(JSON.stringify({success:false,error:"REELS exige video_url."}),{status:400,headers:H});
    if(mediaType==="STORIES"&&!imageUrl&&!videoUrl)return new Response(JSON.stringify({success:false,error:"STORIES exige image_url ou video_url."}),{status:400,headers:H});

    const gate=await preflight(sb,token,accountId,mediaType,true,manualTest);
    if(!gate.allowed){
      return new Response(JSON.stringify({
        success:false,
        deferred:true,
        rate_guard:true,
        error:gate.reason,
        retry_at:gate.retry_at,
        usage_percent:Number(gate.state?.usage_percent??0),
        quota_usage:gate.state?.quota_usage??null,
        quota_total:gate.state?.quota_total??null,
        integrity_hold:gate.state?.integrity_hold===true,
        last_meta_error:gate.state?.last_meta_error??null
      }),{status:429,headers:H});
    }

    let result:any=await tryPublish(sb,token,accountId,mediaType,imageUrl,videoUrl,caption,shareToFeed,manualTest);
    if(!result.success&&!result.terminal){
      const refreshed=await refreshAndPersist(sb,token);
      if(refreshed.ok&&refreshed.token){
        token=refreshed.token;
        const gate2=await preflight(sb,token,accountId,mediaType,false,manualTest);
        if(gate2.allowed)result=await tryPublish(sb,token,accountId,mediaType,imageUrl,videoUrl,caption,shareToFeed,manualTest);
      }
    }

    if(!result.success){
      const rate=!!result.rate_limited||!!result.deferred_processing;
      return new Response(JSON.stringify({
        success:false,
        deferred:rate,
        rate_guard:!!result.rate_limited,
        retry_at:result.retry_at??(rate?isoAfter(15):null),
        error:rate?"Publicação adiada pelo controle preventivo da Meta.":"Falha na autorização/publicação da Meta.",
        media_type:mediaType,
        diagnostics:result.diagnostics,
        integrity_hold:(await getState(sb))?.integrity_hold===true,
        publish_unconfirmed:result.publish_unconfirmed===true,
        creation_id:result.creation_id??null
      }),{status:rate?429:500,headers:H});
    }

    const state=await getState(sb);
    return new Response(JSON.stringify({
      success:true,
      message:"Publicação enviada para o Instagram.",
      instagram_media_id:result.instagram_media_id,
      media_type:result.media_type,
      api_used:result.api_used,
      usage_percent:Number(state?.usage_percent??0),
      quota_usage:state?.quota_usage??null,
      quota_total:state?.quota_total??null
    }),{status:200,headers:H});
  }catch(e){
    return new Response(JSON.stringify({success:false,error:e instanceof Error?e.message:String(e)}),{status:500,headers:H});
  }
});