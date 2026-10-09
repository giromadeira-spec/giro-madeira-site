import {createClient} from "npm:@supabase/supabase-js@2.57.0";

// TikTok OAuth web callback. Public GET is guarded by a one-time 256-bit CSRF state.
const SITE="https://giro-madeira.netlify.app";
const SUPA=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const KEY=Deno.env.get("TIKTOK_CLIENT_KEY")||"";
const SECRET=Deno.env.get("TIKTOK_CLIENT_SECRET")||"";
const CALLBACK=SUPA+"/functions/v1/giro-tiktok-callback";
const te=new TextEncoder();
const db=createClient(SUPA,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
function go(code:string){const url=new URL(SITE+"/tiktok-integracao.html");url.searchParams.set("tiktok",code);return Response.redirect(url.toString(),302)}
function bytesToHex(bytes:Uint8Array){return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("")}
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes))}
async function storageKey(){const raw=await crypto.subtle.digest("SHA-256",te.encode("GiroMadeira/tiktok/token-storage/v1:"+SECRET));return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt"])}
async function secureToken(key:CryptoKey,value:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,te.encode(value)));
 return {cipher:b64(ciphertext),nonce:b64(iv)};
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="GET")return new Response("Method not allowed",{status:405,headers:{"Cache-Control":"no-store"}});
 if(!SUPA||!SERVICE||!KEY||!SECRET)return go("setup_required");
 try{
  const url=new URL(req.url);
  const state=url.searchParams.get("state")||"";
  const code=url.searchParams.get("code")||"";
  if(state.length<35||state.length>150||!/^[A-Za-z0-9_-]+$/.test(state))return go("invalid_state");
  const hashed=bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(state))));
  const now=new Date().toISOString();
  const {data:entry,error:lookupError}=await db.from("giro_tiktok_oauth_requests")
    .update({consumed_at:now}).eq("state_hash",hashed).is("consumed_at",null)
    .gt("expires_at",now).select("editor_user_id").maybeSingle();
  if(lookupError||!entry)return go("invalid_or_expired_state");
  if(!code||url.searchParams.has("error"))return go("authorization_not_granted");
  const tokenResponse=await fetch("https://open.tiktokapis.com/v2/oauth/token/",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Cache-Control":"no-cache"},
    body:new URLSearchParams({client_key:KEY,client_secret:SECRET,code,grant_type:"authorization_code",redirect_uri:CALLBACK}),
    signal:AbortSignal.timeout(20000)
  });
  const token=await tokenResponse.json().catch(()=>({}));
  if(!tokenResponse.ok||!token.access_token||!token.refresh_token||!token.open_id)return go("token_exchange_failed");
  const scopes=String(token.scope||"");
  if(!scopes.split(",").includes("user.info.basic"))return go("basic_scope_not_granted");
  let displayName="";
  let avatar="";
  try{
    const profileResponse=await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",{
      headers:{"Authorization":"Bearer "+String(token.access_token)},
      signal:AbortSignal.timeout(12000)
    });
    const profile=await profileResponse.json().catch(()=>({}));
    if(profileResponse.ok&&profile?.error?.code==="ok"){
      displayName=String(profile?.data?.user?.display_name||"").slice(0,100);
      avatar=String(profile?.data?.user?.avatar_url||"").slice(0,600);
    }
  }catch{ /* TikTok profile is optional; token already validated */ }
  const key=await storageKey();
  const a=await secureToken(key,String(token.access_token));
  const b=await secureToken(key,String(token.refresh_token));
  const expiry=Number(token.expires_in||86400);
  const refreshExpiry=Number(token.refresh_expires_in||31536000);
  const editorUserId=entry.editor_user_id;
  const {error:saveError}=await db.from("giro_tiktok_connections").upsert({
    editor_user_id:editorUserId,tiktok_open_id:String(token.open_id),
    display_name:displayName,avatar_url:avatar,granted_scopes:scopes,
    access_token_encrypted:a.cipher,access_token_nonce:a.nonce,
    refresh_token_encrypted:b.cipher,refresh_token_nonce:b.nonce,
    access_expires_at:new Date(Date.now()+expiry*1000).toISOString(),
    refresh_expires_at:new Date(Date.now()+refreshExpiry*1000).toISOString(),
    updated_at:new Date().toISOString()
  },{onConflict:"editor_user_id"});
  if(saveError)return go("account_storage_failed");
  return go("connected");
 }catch{ return go("technical_error") }
});