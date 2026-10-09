import {createClient} from "npm:@supabase/supabase-js@2.57.0";
import {jwtVerify,createRemoteJWKSet} from "npm:jose@6.0.11";

// A GitHub Actions workflow separate from YouTube production prepares TikTok-compatible videos.
const owner="giromadeira-spec/giro-madeira-site";
const ref=owner+"/.github/workflows/giro-tiktok-30fps.yml@refs/heads/main";
const audience="https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/giro-tiktok-30fps-bridge";
const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return response({success:false,error:"method_not_allowed"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return response({success:false,error:"missing_github_oidc"},401);
 let claims:any;
 try{
   const verified=await jwtVerify(auth.slice(7),jwks,{issuer:"https://token.actions.githubusercontent.com",
      audience,algorithms:["RS256"],clockTolerance:15});
   claims=verified.payload;
   if(claims.repository!==owner||String(claims.repository_id)!=="1403695629"
      ||claims.ref!=="refs/heads/main"||claims.workflow_ref!==ref
      ||!["push","schedule","workflow_dispatch"].includes(String(claims.event_name||"")))
     throw Error("claim_mismatch");
 }catch{return response({success:false,error:"github_identity_denied"},403)}
 const run=String(claims.run_id||"")+"."+String(claims.run_attempt||"1");
 const supa=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!supa||!key)return response({success:false,error:"missing_database_config"},503);
 const db=createClient(supa,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const body=await req.json().catch(()=>({}));
 const action=String(body.action||"status");
 try{
  const {data:cfg,error:ce}=await db.from("giro_buffer_tiktok_settings").select("channel_id,channel_name,daily_limit").eq("id","giro_madeira").single();
  if(ce||!cfg?.channel_id||cfg.channel_name!=="giro_madeira")
    return response({success:false,error:"tiktok_channel_not_configured"},409);
  if(action==="status")return response({success:true,transcoder:"independent_30fps",channel:"giro_madeira"});
  if(action==="claim"){
    const {data:sources,error:e}=await db.from("giro_social_video_queue")
      .select("id,title,video_url,source_id,scheduled_for,shorts_rendered_at,shorts_render_origin,storyboard_status,editor_approved,visual_review_status,provider_privacy_status,provider_post_id,shorts_image_credit")
      .eq("platform","youtube_shorts").eq("status","enviado")
      .eq("editor_approved",true).eq("visual_review_status","approved")
      .eq("provider_privacy_status","public").not("provider_post_id","is",null)
      .eq("shorts_render_origin","github_oidc_v1").eq("storyboard_status","preparado")
      .gte("shorts_rendered_at",new Date(Date.now()-18*3600000).toISOString())
      .order("scheduled_for",{ascending:false}).limit(16);
    if(e)return response({success:false,error:"source_lookup_failed"},503);
    for(const row of sources||[]){
      const original=String(row.video_url||"");
      if(!original.startsWith(supa+"/storage/v1/object/public/news-videos/shorts/")||!original.endsWith(".mp4"))
        continue;
      const {data:existing,error:pe}=await db.from("giro_tiktok_media_prepared").select("status").eq("source_queue_id",row.id).maybeSingle();
      if(pe)return response({success:false,error:"prepared_lookup_failed"},503);
      if(existing)continue;
      const {data:job,error:je}=await db.from("giro_buffer_tiktok_jobs").select("status,last_error").eq("source_queue_id",row.id).maybeSingle();
      if(je)return response({success:false,error:"post_state_lookup_failed"},503);
      if(job&&!(row.id===10&&job.status==="review_required"&&/frame rate/i.test(job.last_error||"")))
        continue;
      const path="shorts/tiktok-30fps/"+String(row.id)+"/"+crypto.randomUUID()+".mp4";
      const {data:claimed,error:insertError}=await db.from("giro_tiktok_media_prepared").insert({
         source_queue_id:row.id,original_video_url:original,storage_path:path,
         status:"claimed",render_job_id:run
      }).select("source_queue_id").maybeSingle();
      if(insertError||!claimed)continue;
      const signed=await db.storage.from("news-videos").createSignedUploadUrl(path);
      if(signed.error||!signed.data){
        await db.from("giro_tiktok_media_prepared").update({status:"failed",last_error:"signed_upload_failed"}).eq("source_queue_id",row.id).eq("render_job_id",run);
        return response({success:false,error:"storage_slot_failed"},503);
      }
      const uploadUrl=new URL(signed.data.signedUrl,supa).toString();
      if(new URL(uploadUrl).origin!==new URL(supa).origin)return response({success:false,error:"untrusted_upload_url"},500);
      return response({success:true,processed:1,source_queue_id:row.id,
        original_video_url:original,converted_video_url:supa+"/storage/v1/object/public/news-videos/"+path,
        storage_path:path,upload_url:uploadUrl});
    }
    return response({success:true,processed:0,reason:"no_ready_approved_shorts_to_convert"});
  }
  if(!["complete","fail"].includes(action))return response({success:false,error:"invalid_action"},400);
  const sourceId=Number(body.source_queue_id);
  if(!Number.isSafeInteger(sourceId)||sourceId<1)return response({success:false,error:"bad_source_id"},400);
  const {data:claimed,error:re}=await db.from("giro_tiktok_media_prepared").select("*").eq("source_queue_id",sourceId).maybeSingle();
  if(re||!claimed||claimed.status!=="claimed"||claimed.render_job_id!==run)
    return response({success:false,error:"render_claim_not_owned"},409);
  if(action==="fail"){
    await db.from("giro_tiktok_media_prepared").update({status:"failed",last_error:"transcode_or_media_quality_failed"}).eq("source_queue_id",sourceId).eq("render_job_id",run);
    return response({success:true,failed:true,source_queue_id:sourceId});
  }
  if(String(body.storage_path||"")!==claimed.storage_path)return response({success:false,error:"storage_path_conflict"},409);
  const fps=Number(body.output_fps),width=Number(body.width),height=Number(body.height),seconds=Number(body.seconds);
  if(!Number.isFinite(fps)||fps<29.5||fps>30.5||width<480||height<720||height<=width||seconds<5||seconds>180
     ||body.codec!=="h264"||body.pix_fmt!=="yuv420p")
    return response({success:false,error:"tiktok_media_quality_failed"},422);
  const prefix=claimed.storage_path.slice(0,claimed.storage_path.lastIndexOf("/")+1);
  const filename=claimed.storage_path.slice(claimed.storage_path.lastIndexOf("/")+1);
  const {data:files,error:storageError}=await db.storage.from("news-videos").list(prefix,{limit:100,search:filename});
  if(storageError)return response({success:false,error:"uploaded_media_inaccessible"},503);
  const file=(files||[]).find(x=>x.name===filename);
  const size=Number(file?.metadata?.size||0);
  if(!file||size<100000||size>30*1024*1024)return response({success:false,error:"tiktok_video_size_invalid"},422);
  const converted=supa+"/storage/v1/object/public/news-videos/"+claimed.storage_path;
  const {error:completeError}=await db.from("giro_tiktok_media_prepared").update({
    status:"ready",converted_video_url:converted,input_fps:Number(body.input_fps)||null,
    output_fps:fps,output_width:width,output_height:height,
    output_seconds:seconds,output_size_bytes:size,
    completed_at:new Date().toISOString(),last_error:null
  }).eq("source_queue_id",sourceId).eq("status","claimed").eq("render_job_id",run);
  if(completeError)return response({success:false,error:"cannot_complete_preparation"},500);
  return response({success:true,converted:true,source_queue_id:sourceId,output_fps:fps,ready:true});
 }catch{return response({success:false,error:"transcoder_bridge_operation_failed"},500)}
});