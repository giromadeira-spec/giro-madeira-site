import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Giro Madeira -> Buffer -> TikTok. Runs only after explicit admin activation.
// NEVER mutates YouTube/Instagram queues. A failed/uncertain Buffer call is NOT retried.
const SUPA=Deno.env.get("SUPABASE_URL")||"";
const SVC=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const BUFFER_KEY=Deno.env.get("BUFFER_API_KEY")||"";
const respond=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const db=createClient(SUPA,SVC,{auth:{persistSession:false,autoRefreshToken:false}});
async function bufferRequest(query:string,variables?:Record<string,unknown>){
 const res=await fetch("https://api.buffer.com",{
  method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+BUFFER_KEY},
  body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(24000)
 });
 const json=await res.json().catch(()=>({errors:[{message:"non_json_response"}]}));
 if(!res.ok||json.errors?.length)throw new Error("buffer_api_error_"+String(res.status)+"_"+String(json.errors?.[0]?.extensions?.code||""));
 return json.data;
}
async function reconcile(organizationId:string,channelId:string){
 const {data:pending,error}=await db.from("giro_buffer_tiktok_jobs").select("id,buffer_post_id,created_at,updated_at")
   .eq("status","queued").not("buffer_post_id","is",null)
   .lt("updated_at",new Date(Date.now()-60*60000).toISOString()).limit(25);
 if(error||!pending?.length)return {checked:0};
 const escapedOrg=JSON.stringify(organizationId),escapedChannel=JSON.stringify(channelId);
 const q="query { posts(first:100,input:{organizationId:"+escapedOrg+",filter:{status:[sent,error],channelIds:["+escapedChannel+"]},sort:{field:dueAt,direction:desc}}){edges{node{id,status,externalLink,sentAt,error{message}}}} }";
 const result=await bufferRequest(q);
 const map=new Map((result?.posts?.edges||[]).map((x:{node:{id:string}})=>[x.node.id,x.node]));
 let changed=0;
 for(const p of pending){
  const remote=map.get(p.buffer_post_id) as {id:string,status:string,externalLink?:string,sentAt?:string,error?:{message?:string}}|undefined;
  if(!remote)continue;
  if(remote.status==="sent"){
   const {error:e}=await db.from("giro_buffer_tiktok_jobs").update({
    status:"sent",sent_at:remote.sentAt||new Date().toISOString(),
    buffer_post_url:remote.externalLink||null,updated_at:new Date().toISOString()
   }).eq("id",p.id).eq("status","queued");
   if(!e)changed++;
  }else if(remote.status==="error"){
   await db.from("giro_buffer_tiktok_jobs").update({
    status:"review_required",last_error:String(remote.error?.message||"buffer_publish_failed").slice(0,150),
    updated_at:new Date().toISOString()
   }).eq("id",p.id).eq("status","queued");
   changed++;
  }
 }
 return {checked:pending.length,changed};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return respond({ok:false,error:"method_not_allowed"},405);
 if(!SUPA||!SVC)return respond({ok:false,error:"server_configuration_missing"},503);
 const auth=req.headers.get("x-giro-db-key")||"";
 if(auth.length<15||auth.length>512)return respond({ok:false,error:"unauthorized"},401);
 const valid=await db.rpc("validar_giro_dispatch_key",{p_key:auth});
 if(valid.error||valid.data!==true)return respond({ok:false,error:"unauthorized"},401);
 const {data:cfg,error:e}=await db.from("giro_buffer_tiktok_settings").select("*").eq("id","giro_madeira").single();
 if(e)return respond({ok:false,error:"settings_unavailable"},503);
 // Safe Supabase-only configuration checks: authenticated with the existing
 // database dispatch key. No Netlify browser or hosting is required.
 const requestBody=await req.json().catch(()=>({}));
 const action=String(requestBody?.action||"run");
 if(action==="status")return respond({
   ok:true,api_key_configured:!!BUFFER_KEY,
   buffer_channel_selected:!!(cfg.channel_id&&cfg.organization_id),
   buffer_channel_name:cfg.channel_name||null,
   enabled:!!cfg.enabled,dry_run:!!cfg.dry_run,
   daily_limit:cfg.daily_limit,min_interval_minutes:cfg.min_interval_minutes,
   test_draft_completed:!!cfg.test_draft_post_id
 });
 if(action==="discover"){
   if(!BUFFER_KEY)return respond({ok:false,error:"buffer_api_key_missing"},503);
   try{
     const query=async(q:string)=>{
       const response=await fetch("https://api.buffer.com",{
         method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+BUFFER_KEY},
         body:JSON.stringify({query:q}),signal:AbortSignal.timeout(18000)
       });
       const body=await response.json().catch(()=>({}));
       if(!response.ok||body.errors?.length)throw Error("buffer_api_query_error");
       return body.data;
     };
     const account=await query("query{account{organizations{id,name}}}");
     const found=[];
     for(const org of (account?.account?.organizations||[]).slice(0,10)){
       const channels=await query("query{channels(input:{organizationId:"+JSON.stringify(org.id)+"}){id,name,displayName,service,isQueuePaused}}");
       for(const item of channels?.channels||[])if(String(item.service||"").toLowerCase()==="tiktok")
         found.push({organization_id:String(org.id),organization_name:String(org.name||""),
           channel_id:String(item.id),channel_name:String(item.displayName||item.name||""),
           queue_paused:!!item.isQueuePaused});
     }
     return respond({ok:true,channels:found});
   }catch{return respond({ok:false,error:"buffer_api_lookup_failed"},502)}
 }

 // Isolated, non-public connection test. The Buffer API documents
 // saveToDraft=true as a draft which is NOT scheduled or published.
 if(action==="test_draft"){
   if(!BUFFER_KEY||!cfg.channel_id||!cfg.organization_id)
     return respond({ok:false,error:"configure_buffer_tiktok_channel_first"},409);
   if(cfg.enabled||!cfg.dry_run)return respond({ok:false,error:"disable_auto_before_test"},409);
   if(cfg.test_draft_post_id)
     return respond({ok:true,already_tested:true,draft_post_id:cfg.test_draft_post_id});
   const {data:verified,error:lookupError}=await db.from("giro_social_video_queue")
     .select("id,title,video_url")
     .eq("platform","youtube_shorts").eq("status","enviado")
     .eq("editor_approved",true).eq("visual_review_status","approved")
     .eq("provider_privacy_status","public").not("provider_post_id","is",null)
     .eq("shorts_render_origin","github_oidc_v1")
     .gte("shorts_rendered_at",new Date(Date.now()-24*3600000).toISOString())
     .order("shorts_rendered_at",{ascending:false}).limit(1);
   if(lookupError||!verified?.length)return respond({ok:false,error:"no_approved_recent_video_for_draft"},409);
   const candidate=verified[0];
   const url=String(candidate.video_url||"");
   if(!url.startsWith(SUPA+"/storage/v1/object/public/news-videos/shorts/")||!url.endsWith(".mp4"))
     return respond({ok:false,error:"invalid_video_source_for_draft"},422);
   let reachable=false;
   try{
     const h=await fetch(url,{method:"HEAD",redirect:"error",signal:AbortSignal.timeout(12000)});
     reachable=h.ok&&/video\/mp4|application\/octet-stream/i.test(h.headers.get("content-type")||"");
   }catch{}
   if(!reachable)return respond({ok:false,error:"public_video_inaccessible"},422);
   // A post draft never counts as successful public delivery.
   const mutation="mutation DraftTest($input:CreatePostInput!){createPost(input:$input){... on PostActionSuccess{post{id,status}} ... on MutationError{message}}}";
   const variables={input:{
     channelId:cfg.channel_id,
     text:"TESTE DE INTEGRAÇÃO — "+String(candidate.title||"Giro Madeira").slice(0,135)+" #GiroMadeira",
     schedulingType:"automatic",mode:"addToQueue",saveToDraft:true,
     assets:[{video:{url}}]
   }};
   try{
     const data=await bufferRequest(mutation,variables);
     const reply=data?.createPost;
     const post=reply?.post;
     if(!post?.id)
       return respond({ok:false,error:"buffer_rejected_draft",detail:String(reply?.message||"unknown").slice(0,180)},422);
     // Any surprising status requires human investigation, never auto-enable.
     if(String(post.status||"").toLowerCase()!=="draft")
       return respond({ok:false,error:"unexpected_buffer_draft_status_manual_review",post_id:String(post.id),status:post.status},409);
     const {error:saveError}=await db.from("giro_buffer_tiktok_settings").update({
       test_draft_post_id:String(post.id),last_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()
     }).eq("id","giro_madeira").eq("enabled",false).eq("dry_run",true).is("test_draft_post_id",null);
     if(saveError)return respond({ok:false,error:"draft_created_but_local_save_failed_manual_review",post_id:String(post.id)},500);
     return respond({ok:true,draft_created:true,published:false,post_id:String(post.id),
       status:"draft",source_queue_id:candidate.id});
   }catch{
     return respond({ok:false,error:"buffer_draft_response_unknown_check_buffer_before_retry"},502);
   }
 }
 if(action==="inspect_draft"){
   if(!BUFFER_KEY||!cfg.test_draft_post_id)return respond({ok:false,error:"draft_not_configured"},409);
   try{
     const query="query{post(input:{id:"+JSON.stringify(cfg.test_draft_post_id)+"}){id,status,channelId,assets{mimeType,source,thumbnail}}}";
     const payload=await bufferRequest(query);
     const item=payload?.post;
     if(!item||item.id!==cfg.test_draft_post_id||item.channelId!==cfg.channel_id)
       return respond({ok:false,error:"draft_mismatch_or_missing"},409);
     const assets=Array.isArray(item.assets)?item.assets:[];
     return respond({ok:true,post_id:item.id,status:item.status,
       assets:assets.map((a:{mimeType?:string,source?:string,thumbnail?:string})=>({
         mime_type:a.mimeType||null, video_source_present:!!a.source,
         video_source_is_supabase:typeof a.source==="string"&&a.source.startsWith(SUPA+"/storage/v1/object/public/news-videos/shorts/"),
         has_thumbnail:!!a.thumbnail
       }))});
   }catch{return respond({ok:false,error:"draft_inspection_failed"},502);}
 }
 if(action!=="run")return respond({ok:false,error:"unsupported_action"},400);
 if(!cfg.enabled||cfg.dry_run)return respond({ok:true,processed:0,reason:"buffer_auto_off"});
 if(!BUFFER_KEY||!cfg.channel_id||!cfg.organization_id)return respond({ok:true,processed:0,reason:"buffer_not_configured"});
 try{
   let reconciliation={checked:0};
   try{reconciliation=await reconcile(cfg.organization_id,cfg.channel_id)}catch(err){
    return respond({ok:false,processed:0,error:"buffer_status_unavailable",detail:String(err).slice(0,160)},503);
   }
   const {data:claimed,error:claimError}=await db.rpc("giro_buffer_claim_tiktok_video");
   if(claimError)return respond({ok:false,error:"claim_failed"},500);
   if(!claimed?.length)return respond({ok:true,processed:0,reason:"no_due_verified_videos_or_spacing",reconciliation});
   const job=claimed[0],jobId=Number(job.job_id),videoUrl=String(job.video_url||"");
   const url=new URL(videoUrl);
   if(url.origin!==SUPA||!url.pathname.startsWith("/storage/v1/object/public/news-videos/shorts/")||!url.pathname.endsWith(".mp4")){
    await db.from("giro_buffer_tiktok_jobs").update({status:"review_required",last_error:"video_url_not_allowed",updated_at:new Date().toISOString()}).eq("id",jobId);
    return respond({ok:false,processed:0,error:"video_url_not_allowed"},422);
   }
   let reachable=false;
   try{
     const head=await fetch(url,{method:"HEAD",redirect:"error",signal:AbortSignal.timeout(10000)});
     reachable=head.ok && /video\/mp4|application\/octet-stream/i.test(head.headers.get("content-type")||"");
   }catch{}
   if(!reachable){
    await db.from("giro_buffer_tiktok_jobs").update({status:"review_required",last_error:"public_video_not_reachable_or_wrong_type",updated_at:new Date().toISOString()}).eq("id",jobId);
    return respond({ok:false,processed:0,error:"public_video_not_reachable_or_wrong_type"},422);
   }
   const gql="mutation CreatePost($input:CreatePostInput!){createPost(input:$input){... on PostActionSuccess{post{id,dueAt,status}} ... on MutationError{message}}}";
   const variables={input:{
      channelId:cfg.channel_id,text:String(job.caption),schedulingType:"automatic",mode:"addToQueue",
      assets:[{video:{url:videoUrl}}]
   }};
   try{
     const result=await bufferRequest(gql,variables);
     const created=result?.createPost;
     if(!created?.post?.id)throw new Error("buffer_returned_no_post_id_"+String(created?.message||""));
     const {error:saveError}=await db.from("giro_buffer_tiktok_jobs").update({
       status:"queued",buffer_post_id:String(created.post.id),
       buffer_due_at:created.post.dueAt||null,queued_at:new Date().toISOString(),
       updated_at:new Date().toISOString()
     }).eq("id",jobId).eq("status","claimed");
     if(saveError)return respond({ok:false,processed:0,error:"post_queued_but_local_save_failed_manual_reconciliation",job_id:jobId},500);
     return respond({ok:true,processed:1,job_id:jobId,buffer_post_id:created.post.id,due_at:created.post.dueAt||null,reconciliation,note:"queued_in_buffer_not_yet_published"});
   }catch(err){
     await db.from("giro_buffer_tiktok_jobs").update({
       status:"uncertain",last_error:String(err).slice(0,160),updated_at:new Date().toISOString()
     }).eq("id",jobId).eq("status","claimed");
     return respond({ok:false,processed:0,error:"buffer_response_uncertain_requires_review",job_id:jobId},502);
   }
 }catch{
   return respond({ok:false,processed:0,error:"worker_unexpected_error"},500);
 }
});