import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { storyboardIsCurrent } from "../_shared/article-recency.ts";

const respond=(o:unknown,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const normal=(s:unknown)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/&(?:nbsp|amp|quot|rsquo|ldquo|rdquo);/g," ").replace(/&#(?:x[0-9a-f]+|\d+);/gi," ")
 .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
const allowedSource=(raw:string)=>{
 try{const u=new URL(raw);return u.protocol==="https:" && !u.username && !u.password &&
  (["www.cnnbrasil.com.br","cnnbrasil.com.br","agenciabrasil.ebc.com.br"].includes(u.hostname)||
   u.hostname.endsWith(".gov.br")) && u.pathname.length>24 && !u.port ? u : null;}catch{return null;}
};
const credit=async(url:string,title:string)=>{
 const value=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(url+"\n"+title));
 return "original_editorial_labeled_v2_"+Array.from(new Uint8Array(value)).map(v=>v.toString(16).padStart(2,"0")).join("").slice(0,24);
};
const getPage=async(raw:string)=>{
 const url=allowedSource(raw);if(!url)return null;
 // CNN's canonical article URL ends in "/" and redirects the no-slash path.
 // Normalize it without accepting any cross-origin redirect.
 if(url.hostname==="www.cnnbrasil.com.br"||url.hostname==="cnnbrasil.com.br"){
   if(!url.pathname.endsWith("/"))url.pathname+="/";
 }
 try{
  const r=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(11000),
    headers:{"Accept":"text/html","User-Agent":"GiroMadeiraEditorialValidator/1.0"}});
  if(!r.ok||!String(r.headers.get("content-type")||"").includes("text/html"))return null;
  const html=(await r.text()).slice(0,1300000);
  const htmlTitle=(html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").trim();
  // Remove non-editorial script and style content, keep normal article text.
  const body=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;|&amp;|&quot;/gi," ");
  return {title:normal(htmlTitle),body:normal(body)};
 }catch{return null;}
};
const videoMetadata=async(supa:string,platform:string,url:string)=>{
 try{
  const path=new URL(url),expect=platform==="youtube_shorts"?
   "/storage/v1/object/public/news-videos/shorts/auto/":
   "/storage/v1/object/public/news-videos/shorts/tiktok-original/";
  if(path.origin!==supa||!path.pathname.startsWith(expect)||!path.pathname.endsWith(".mp4"))
    return false;
  const head=await fetch(url,{method:"HEAD",redirect:"error",signal:AbortSignal.timeout(12000)});
  const length=Number(head.headers.get("content-length")||0);
  return head.ok && String(head.headers.get("content-type")||"").toLowerCase().includes("video/mp4")&&length>=100000&&length<=30*1024*1024;
 }catch{return false;}
};
const report=(id:number,status:string,reason:string)=>({id,status,reason});
Deno.serve(async req=>{
 if(req.method!=="POST")return respond({success:false,error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)return respond({success:false,error:"server_not_configured"},503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 const token=req.headers.get("x-giro-db-key")||"";
 const aut=await db.rpc("validar_giro_dispatch_key",{p_key:token});
 if(!token||aut.error||aut.data!==true)return respond({success:false,error:"unauthorized"},401);
 const dry=Boolean((await req.json().catch(()=>({}))).dry_run);
 const at=Date.now();
 const {data,error}=await db.from("giro_social_video_queue")
  .select("id,platform,title,status,source_url,scene_cards,topic_scope,scheduled_for,storyboard_status,storyboard_source_published_at,shorts_rendered_at,shorts_render_origin,shorts_render_version,shorts_image_credit,video_url,editor_approved,visual_review_status,provider_post_id")
  .in("platform",["youtube_shorts","tiktok"]).eq("status","pronto_para_revisao")
  .eq("editor_approved",false).eq("visual_review_status","pending").eq("storyboard_status","preparado")
  .is("provider_post_id",null).gte("scheduled_for",new Date(at-44*60000).toISOString())
  .lte("scheduled_for",new Date(at+4*3600000).toISOString())
  .order("scheduled_for",{ascending:true}).limit(12);
 if(error)return respond({success:false,error:"queue_read_failed"},503);
 const results:any[]=[];
 for(const item of data||[]){
  const reject=(reason:string)=>results.push(report(item.id,"held",reason));
  const src=allowedSource(String(item.source_url||""));
  const origin=item.platform==="youtube_shorts"?"github_oidc_v1":"tiktok_github_oidc_v1";
  if(!src||item.topic_scope!=="mundo"&&item.topic_scope!=="brasil") {reject("untrusted_source_or_scope");continue;}
  const headline=String(item.title||"");
  if(headline.length<28||headline.length>160||item.shorts_render_origin!==origin ||
    Number(item.shorts_render_version)!==6||!storyboardIsCurrent(item,at)){
    reject("renderer_or_article_freshness_not_verified");continue;
  }
  // Only deterministic pictogram templates from the verified renderer.
  // No reconstructed victims, officers, real-event photographs, or AI faces.
  const symbolic=/protest|manifesta[cç]|greve|inc[eê]ndio|fogo|terremoto|trem|ferrovia|internet|energia|acidente|rodovia/i;
  if(!symbolic.test(headline)||String(item.shorts_image_credit||"")!==await credit(String(item.source_url),headline)){
    reject("symbolic_template_or_cryptographic_credit_mismatch");continue;
  }
  const scenes=item.scene_cards;
  if(!Array.isArray(scenes)||scenes.length!==3||
     scenes.some((x:any)=>typeof x!=="string"||x.length<22||x.length>180)){
    reject("storyboard_scene_structure_invalid");continue;
  }
  const rendered=Date.parse(String(item.shorts_rendered_at||""));
  if(!Number.isFinite(rendered)||rendered<at-4*3600000||rendered>at+300000){
    reject("render_not_recent");continue;
  }
  const page=await getPage(String(item.source_url||""));
  // Source title and ALL rendered scene statements must be present in the
  // original publication: reject creative or out-of-context text.
  const headTokens=normal(headline).split(" ").filter(x=>x.length>=4);
  const titleMatch=page && headTokens.filter(x=>page.title.includes(x)).length>=Math.ceil(headTokens.length*0.8);
  if(!page){reject("article_html_unavailable");continue;}
  if(!titleMatch){reject("original_article_headline_mismatch");continue;}
  const missingScene=scenes.findIndex((s:string)=>!page.body.includes(normal(s)));
  if(missingScene>=0){reject("original_article_scene_unverifiable_"+String(missingScene+1));continue;}
  if(!await videoMetadata(url,item.platform,String(item.video_url||""))){
    reject("video_storage_or_mp4_metadata_invalid");continue;
  }
  if(dry){results.push(report(item.id,"eligible","machine_verifiable_symbolic_news_v1"));continue;}
  // Re-read the entire constrained item before committing; concurrent edits and
  // post attempts cannot be promoted accidentally.
  const {data:current,error:ce}=await db.from("giro_social_video_queue")
    .select("id,status,editor_approved,visual_review_status,provider_post_id,video_url,shorts_image_credit,shorts_render_version")
    .eq("id",item.id).eq("platform",item.platform).maybeSingle();
  if(ce||!current||current.status!=="pronto_para_revisao"||current.editor_approved!==false||
    current.visual_review_status!=="pending"||current.provider_post_id||
    current.video_url!==item.video_url||current.shorts_image_credit!==item.shorts_image_credit||
    current.shorts_render_version!==6){reject("concurrent_revision_or_delivery");continue;}
  const {data:approved,error:ae}=await db.from("giro_social_video_queue").update({
    editor_approved:true,visual_review_status:"approved",
    auto_review_basis:"machine_verified_symbolic_source_and_render_v1",
    auto_review_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("id",item.id).eq("status","pronto_para_revisao")
    .eq("visual_review_status","pending").eq("editor_approved",false)
    .eq("shorts_image_credit",item.shorts_image_credit)
    .is("provider_post_id",null).select("id").maybeSingle();
  if(ae||!approved){reject("approval_conflict_or_database_error");continue;}
  results.push(report(item.id,"approved","machine_verified_symbolic_source_and_render_v1"));
 }
 return respond({success:true,dry_run:dry,checked:(data||[]).length,results,
  public_posts_attempted:false,format:"auto_editorial_review_symbolic_only"});
});
