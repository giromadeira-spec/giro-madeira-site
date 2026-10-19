import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Recebe exclusivamente ARQUIVOS FINAIS de uma pauta já criada e revisada pelo ChatGPT.
// Drive -> Storage -> registro atômico na fila. Não gera arte, não publica diretamente.
const H={"Content-Type":"application/json","Cache-Control":"no-store"};
const FOLDER_ID="1ul9OaWc3M3UNNPKnS6adPKeUC2SX6i5M";
const ORIGIN="https://dsihvbdhocbqscaypraw.supabase.co/storage/v1/object/public/";
const SPECS=[
 {key:"feed",suffix:"feed.jpg",bucket:"news-images",prefix:"auto/jpeg/feed/feed/",mime:"image/jpeg",min:30000,max:12000000,w:1080,h:1080},
 {key:"reel_story",suffix:"reel-story.jpg",bucket:"news-images",prefix:"auto/jpeg/reels/story/",mime:"image/jpeg",min:30000,max:12000000,w:1080,h:1920},
 {key:"story",suffix:"story.jpg",bucket:"news-images",prefix:"auto/jpeg/stories/story/",mime:"image/jpeg",min:30000,max:12000000,w:1080,h:1920},
 {key:"reel",suffix:"reel.mp4",bucket:"news-videos",prefix:"auto/reels/reels/",mime:"video/mp4",min:100000,max:35000000}
];
function respond(data,status=200){return new Response(JSON.stringify(data),{status,headers:H})}
function b64url(raw){const b=typeof raw==="string"?new TextEncoder().encode(raw):raw;let s="";for(const n of b)s+=String.fromCharCode(n);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function pemBuf(pem){const s=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");const x=atob(s);return Uint8Array.from(x,c=>c.charCodeAt(0)).buffer}
async function googleToken(sa){
 const now=Math.floor(Date.now()/1000);
 const unsigned=b64url(JSON.stringify({alg:"RS256",typ:"JWT"}))+"."+b64url(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/drive.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
 const privateKey=await crypto.subtle.importKey("pkcs8",pemBuf(sa.private_key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",privateKey,new TextEncoder().encode(unsigned));
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+b64url(new Uint8Array(sig))}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("google_token_unavailable");
 return String((await response.json()).access_token||"");
}
function jpgSize(bytes){
 if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return null;
 let p=2;
 while(p+9<bytes.length){
  if(bytes[p]!==255){p++;continue}
  let marker=bytes[p+1];if(marker===216||marker===217||marker===1){p+=2;continue}
  const len=bytes[p+2]*256+bytes[p+3];
  if(len<2||p+2+len>bytes.length)return null;
  if([192,193,194,195,198,199,201,202,203,205,206,207].includes(marker))
   return {w:bytes[p+7]*256+bytes[p+8],h:bytes[p+5]*256+bytes[p+6]};
  p+=2+len;
 }
 return null;
}
function videoSignature(b){return b.length>16&&new TextDecoder().decode(b.slice(4,8))==="ftyp"}
function fileName(ciclo,suffix){return "giro-"+ciclo.replace(/[-:T]/g,"")+"-"+suffix}
async function lookup(token,name){
 const q="'"+FOLDER_ID+"' in parents and name = '"+name.replace(/'/g,"\\'")+"' and trashed = false";
 const u="https://www.googleapis.com/drive/v3/files?"+new URLSearchParams({q,fields:"nextPageToken,files(id,name,mimeType,size,parents)",pageSize:"10",supportsAllDrives:"true",includeItemsFromAllDrives:"true"});
 const r=await fetch(u,{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error("drive_folder_unreachable_or_permission_missing");
 const files=(await r.json()).files||[];
 if(files.length!==1)throw Error(files.length?"ambiguous_drive_filename:"+name:"drive_final_asset_missing:"+name);
 return files[0];
}
async function download(token,file,spec){
 if(file.mimeType!==spec.mime)throw Error("wrong_mime:"+spec.key);
 if(Number(file.size)<spec.min||Number(file.size)>spec.max)throw Error("wrong_size:"+spec.key);
 const r=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"?alt=media",{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error("drive_download_failed:"+spec.key);
 const bytes=new Uint8Array(await r.arrayBuffer());
 if(bytes.length<spec.min||bytes.length>spec.max)throw Error("bad_download_size:"+spec.key);
 if(spec.mime==="image/jpeg"){
  const d=jpgSize(bytes);
  if(!d||d.w!==spec.w||d.h!==spec.h)throw Error("invalid_jpeg_dimensions:"+spec.key);
 }else if(!videoSignature(bytes))throw Error("invalid_mp4_signature");
 return bytes;
}
Deno.serve(async req=>{
 if(req.method!=="POST")return respond({success:false,error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",rawSa=Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")||"";
 if(!url||!serviceKey||!rawSa)return respond({success:false,error:"missing_server_configuration"},503);
 const db=createClient(url,serviceKey,{auth:{persistSession:false}});
 const auth=await db.rpc("validar_giro_dispatch_key",{p_key:req.headers.get("x-giro-db-key")||""});
 if(auth.error||auth.data!==true)return respond({success:false,error:"unauthorized"},401);
 let b;
 try{b=await req.json()}catch{return respond({success:false,error:"invalid_json"},400)}
 const ciclo=String(b.ciclo_local||"");
 const slots=/^20\d{2}-(?:0[1-9]|1[0-2])-[0-3]\dT(?:0[7-9]|1\d|2[0-2]):00$/;
 if(!slots.test(ciclo))return respond({success:false,error:"invalid_hourly_slot"},422);
 const fields=["titulo","fonte_url","fonte_nome","resumo","legenda","image_kind","imagem_credito","comprovacao_direitos","comprovacao_qa"];
 if(fields.some(k=>typeof b[k]!=="string"||!b[k].trim()))return respond({success:false,error:"incomplete_editorial_package"},422);
 const old=await db.from("giro_chatgpt_pacotes").select("id").or("ciclo_local.eq."+ciclo+",fonte_url.eq."+b.fonte_url).limit(1);
 if(old.error)return respond({success:false,error:"duplicate_check_unavailable"},503);
 if(old.data?.length)return respond({success:false,error:"duplicate_cycle_or_article"},409);
 const uploaded=[];
 try{
  const token=await googleToken(JSON.parse(rawSa));
  const files=await Promise.all(SPECS.map(async s=>({spec:s,file:await lookup(token,fileName(ciclo,s.suffix))})));
  const media=await Promise.all(files.map(async ({spec,file})=>({spec,bytes:await download(token,file,spec)})));
  const urls={};
  for(const entry of media){
   const spec=entry.spec,path=spec.prefix+fileName(ciclo,spec.suffix);
   const {error}=await db.storage.from(spec.bucket).upload(path,entry.bytes,{contentType:spec.mime,cacheControl:"31536000",upsert:false});
   if(error)throw Error("storage_upload_failed:"+spec.key);
   uploaded.push({bucket:spec.bucket,path});
   urls[spec.key]=ORIGIN+spec.bucket+"/"+path;
  }
  const rpc=await db.rpc("giro_chatgpt_registrar_pacote",{
   p_ciclo_local:ciclo,p_titulo:b.titulo,p_fonte_url:b.fonte_url,p_fonte_nome:b.fonte_nome,
   p_resumo:b.resumo,p_legenda:b.legenda,p_feed_image_url:urls.feed,
   p_reel_story_image_url:urls.reel_story,p_story_image_url:urls.story,
   p_video_url:urls.reel,p_image_kind:b.image_kind,p_imagem_credito:b.imagem_credito,
   p_comprovacao_direitos:b.comprovacao_direitos,p_comprovacao_qa:b.comprovacao_qa
  });
  if(rpc.error)throw Error("ingest_rejected:"+String(rpc.error.message||"validation").slice(0,140));
  return respond({success:true,package:rpc.data,media_urls:urls,publication_not_confirmed:true});
 }catch(err){
  if(uploaded.length)await Promise.all(uploaded.map(v=>db.storage.from(v.bucket).remove([v.path])));
  return respond({success:false,error:String(err instanceof Error?err.message:err).slice(0,180),no_publish:true},422);
 }
});
