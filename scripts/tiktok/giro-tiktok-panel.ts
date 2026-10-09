import {createClient} from "npm:@supabase/supabase-js@2.57.0";

// TikTok testing only: every upload requires an authenticated editor and an explicit click.
// Never runs from cron, never copies YouTube/Instagram queues, never claims public delivery.
const SITE="https://giro-madeira.netlify.app";
const SUPA=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const KEY=Deno.env.get("TIKTOK_CLIENT_KEY")||"";
const SECRET=Deno.env.get("TIKTOK_CLIENT_SECRET")||"";
const CALLBACK=SUPA+"/functions/v1/giro-tiktok-callback";
const db=createClient(SUPA,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={
 "Access-Control-Allow-Origin":SITE,
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
 "Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff"
};
function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}})}
function hex(bytes:Uint8Array){return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sha(bytes:Uint8Array){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))}
function randomState(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
const encoder=new TextEncoder();
async function aesKey(){const raw=await crypto.subtle.digest("SHA-256",encoder.encode("GiroMadeira/tiktok/token-storage/v1:"+SECRET));return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"])}
function decode(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function encode(s:Uint8Array){return btoa(String.fromCharCode(...s))}
async function decrypt(key:CryptoKey,cipher:string,iv:string){return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv)},key,decode(cipher)))}
async function encrypt(key:CryptoKey,text:string){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(text));return {cipher:encode(new Uint8Array(encrypted)),nonce:encode(iv)}}
async function authorized(req:Request){
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return null;
 const {data,error}=await db.auth.getUser(bearer.slice(7));
 if(error||!data.user)return null;
 const {data:profile,error:re}=await db.from("editor_profiles").select("role").eq("user_id",data.user.id).maybeSingle();
 if(re||!["admin","editor"].includes(String(profile?.role||"")))return null;
 return data.user.id as string;
}
async function tokenFor(userId:string){
 const {data,error}=await db.from("giro_tiktok_connections").select("*").eq("editor_user_id",userId).maybeSingle();
 if(error||!data)throw Error("tiktok_not_connected");
 const key=await aesKey();
 if(Date.parse(data.access_expires_at)>Date.now()+120000)return {token:await decrypt(key,data.access_token_encrypted,data.access_token_nonce),account:data};
 if(Date.parse(data.refresh_expires_at)<=Date.now()+120000)throw Error("tiktok_connection_expired");
 const refresh=await decrypt(key,data.refresh_token_encrypted,data.refresh_token_nonce);
 const res=await fetch("https://open.tiktokapis.com/v2/oauth/token/",{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({client_key:KEY,client_secret:SECRET,grant_type:"refresh_token",refresh_token:refresh}),
   signal:AbortSignal.timeout(20000)
 });
 const payload=await res.json().catch(()=>({}));
 if(!res.ok||!payload.access_token||!payload.refresh_token)throw Error("tiktok_token_refresh_failed");
 const a=await encrypt(key,String(payload.access_token)),b=await encrypt(key,String(payload.refresh_token));
 const {error:e}=await db.from("giro_tiktok_connections").update({
   access_token_encrypted:a.cipher,access_token_nonce:a.nonce,
   refresh_token_encrypted:b.cipher,refresh_token_nonce:b.nonce,
   granted_scopes:String(payload.scope||data.granted_scopes),
   access_expires_at:new Date(Date.now()+Number(payload.expires_in||86400)*1000).toISOString(),
   refresh_expires_at:new Date(Date.now()+Number(payload.refresh_expires_in||31536000)*1000).toISOString(),
   updated_at:new Date().toISOString()
 }).eq("editor_user_id",userId);
 if(e)throw Error("tiktok_token_store_failed");
 return {token:String(payload.access_token),account:{...data,granted_scopes:String(payload.scope||data.granted_scopes)}};
}
async function handle(req:Request){
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({ok:false,error:"method_not_allowed"},405);
 if(!SUPA||!SERVICE)return reply({ok:false,error:"server_not_ready"},503);
 const editor=await authorized(req);
 if(!editor)return reply({ok:false,error:"editor_login_required"},401);
 const type=req.headers.get("content-type")||"";
 const isUpload=type.toLowerCase().includes("multipart/form-data");
 const data=isUpload?await req.formData():await req.json().catch(()=>({}));
 const action=String(isUpload?data.get("action"):data.action||"status");
 const {data:connected}=await db.from("giro_tiktok_connections").select("tiktok_open_id,display_name,avatar_url,granted_scopes,access_expires_at,refresh_expires_at").eq("editor_user_id",editor).maybeSingle();
 const configured=!!(KEY&&SECRET);
 if(action==="status"){
   const {data:recent}=await db.from("giro_tiktok_upload_log").select("id,file_name,status,tiktok_publish_id,provider_status,created_at,last_error").eq("editor_user_id",editor).order("created_at",{ascending:false}).limit(6);
   return reply({ok:true,configured,connected:!!connected,account:connected?{name:connected.display_name,avatar_url:connected.avatar_url,scopes:connected.granted_scopes,refresh_expires_at:connected.refresh_expires_at}:null,uploads:recent||[],mode:"manual_sandbox_only",auto_publish:false});
 }
 if(!configured)return reply({ok:false,error:"configure_tiktok_secrets_in_supabase"},503);
 if(action==="connect"){
   const state=randomState();
   const hash=await sha(encoder.encode(state));
   const {error}=await db.from("giro_tiktok_oauth_requests").insert({state_hash:hash,editor_user_id:editor,expires_at:new Date(Date.now()+10*60000).toISOString()});
   if(error)return reply({ok:false,error:"state_storage_failed"},500);
   const params=new URLSearchParams({client_key:KEY,scope:"user.info.basic,video.upload",response_type:"code",redirect_uri:CALLBACK,state,disable_auto_auth:"1"});
   return reply({ok:true,authorization_url:"https://www.tiktok.com/v2/auth/authorize/?"+params.toString()});
 }
 if(action==="disconnect"){
   if(!connected)return reply({ok:true,disconnected:true});
   try {
     const {token}=await tokenFor(editor);
     await fetch("https://open.tiktokapis.com/v2/oauth/revoke/",{
       method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
       body:new URLSearchParams({client_key:KEY,client_secret:SECRET,token}),
       signal:AbortSignal.timeout(12000)
     });
   }catch{ /* local disconnection still revokes local access */ }
   const {error}=await db.from("giro_tiktok_connections").delete().eq("editor_user_id",editor);
   if(error)return reply({ok:false,error:"disconnect_failed"},500);
   return reply({ok:true,disconnected:true,reminder:"Revogue o app também nas configurações do TikTok, se necessário."});
 }
 if(!connected)return reply({ok:false,error:"tiktok_not_connected"},409);
 if(!String(connected.granted_scopes).split(",").includes("video.upload"))return reply({ok:false,error:"video_upload_scope_not_granted"},403);
 if(action==="poll"){
   const id=Number(data.upload_id);
   if(!Number.isSafeInteger(id)||id<=0)return reply({ok:false,error:"invalid_upload_id"},400);
   const {data:record}=await db.from("giro_tiktok_upload_log").select("*").eq("id",id).eq("editor_user_id",editor).maybeSingle();
   if(!record?.tiktok_publish_id)return reply({ok:false,error:"upload_not_found"},404);
   const {token}=await tokenFor(editor);
   const response=await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/",{
    method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({publish_id:record.tiktok_publish_id}),signal:AbortSignal.timeout(20000)
   });
   const result=await response.json().catch(()=>({}));
   const providerStatus=String(result?.data?.status||"unknown");
   if(response.ok&&result?.error?.code==="ok")await db.from("giro_tiktok_upload_log").update({provider_status:providerStatus,updated_at:new Date().toISOString()}).eq("id",id);
   return reply({ok:response.ok&&result?.error?.code==="ok",upload_id:id,provider_status:providerStatus,error_code:result?.error?.code||"response_error"});
 }
 if(action!=="upload")return reply({ok:false,error:"action_not_supported"},400);
 if(!isUpload||data.get("confirm_manual_upload")!=="yes")return reply({ok:false,error:"explicit_upload_confirmation_required"},400);
 const file=data.get("file");
 if(!(file instanceof File))return reply({ok:false,error:"mp4_file_required"},400);
 if(!file.name.toLowerCase().endsWith(".mp4")||!["video/mp4","application/octet-stream"].includes(file.type)||file.size<10000||file.size>15*1024*1024)
   return reply({ok:false,error:"mp4_must_be_between_10kb_and_15mb"},422);
 const buffer=new Uint8Array(await file.arrayBuffer());
 const contentHash=await sha(buffer);
 const {data:already}=await db.from("giro_tiktok_upload_log").select("id,status").eq("editor_user_id",editor).eq("content_sha256",contentHash).maybeSingle();
 if(already)return reply({ok:false,error:"video_already_registered_no_duplicate_upload",upload_id:already.id,status:already.status},409);
 const {data:entry,error:logError}=await db.from("giro_tiktok_upload_log").insert({
  editor_user_id:editor,content_sha256:contentHash,file_name:file.name.slice(0,120),file_size:file.size,status:"preparando"
 }).select("id").single();
 if(logError||!entry)return reply({ok:false,error:"upload_log_failed"},500);
 const id=entry.id;
 try{
   const {token}=await tokenFor(editor);
   const init=await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",{
    method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json; charset=UTF-8"},
    body:JSON.stringify({source_info:{source:"FILE_UPLOAD",video_size:file.size,chunk_size:file.size,total_chunk_count:1}}),
    signal:AbortSignal.timeout(20000)
   });
   const result=await init.json().catch(()=>({}));
   if(!init.ok||result?.error?.code!=="ok"||!result?.data?.publish_id||!result?.data?.upload_url)throw Error("tiktok_init_"+String(result?.error?.code||init.status));
   const publishId=String(result.data.publish_id);
   await db.from("giro_tiktok_upload_log").update({tiktok_publish_id:publishId,status:"inicializado",updated_at:new Date().toISOString()}).eq("id",id);
   const remote=new URL(String(result.data.upload_url));
   if(remote.protocol!=="https:"||!["open-upload.tiktokapis.com"].includes(remote.hostname))throw Error("unsafe_upload_url");
   const put=await fetch(remote,{
    method:"PUT",headers:{"Content-Type":"video/mp4","Content-Length":String(file.size),"Content-Range":"bytes 0-"+(file.size-1)+"/"+file.size},
    body:buffer,signal:AbortSignal.timeout(110000)
   });
   if(!put.ok)throw Error("tiktok_upload_http_"+put.status);
   const {error:saveError}=await db.from("giro_tiktok_upload_log").update({status:"enviado_para_caixa_de_entrada",updated_at:new Date().toISOString()}).eq("id",id);
   if(saveError)throw Error("upload_completed_but_log_failed");
   return reply({ok:true,upload_id:id,publish_id:publishId,public_posted:false,next_step:"Abra a notificação no TikTok e conclua a publicação manualmente."});
 }catch(error){
   const message=error instanceof Error?error.message:"upload_error";
   await db.from("giro_tiktok_upload_log").update({status:"verificar_manual",last_error:message.slice(0,120),updated_at:new Date().toISOString()}).eq("id",id);
   return reply({ok:false,error:"upload_status_uncertain_do_not_retry",upload_id:id,detail:message.slice(0,120)},502);
 }
}
Deno.serve(async(req:Request)=>{try{return await handle(req)}catch{ return reply({ok:false,error:"temporary_server_error"},500)}});