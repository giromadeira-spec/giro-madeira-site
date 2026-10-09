import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const SUPA=Deno.env.get("SUPABASE_URL")||"";
const SVC=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const BUFFER_KEY=Deno.env.get("BUFFER_API_KEY")||"";
const SITE="https://giro-madeira.netlify.app";
const cors={"Access-Control-Allow-Origin":SITE,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info","Cache-Control":"no-store"};
function respond(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json","X-Content-Type-Options":"nosniff"}})}
const db=createClient(SUPA,SVC,{auth:{persistSession:false,autoRefreshToken:false}});
async function verifyAdmin(req:Request){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /i,"");
 if(!token)return null;
 const {data,error}=await db.auth.getUser(token);
 if(error||!data?.user?.id)return null;
 const {data:profile,error:e}=await db.from("editor_profiles").select("role").eq("user_id",data.user.id).maybeSingle();
 return !e&&profile?.role==="admin"?data.user.id:null;
}
async function gql(query:string,variables?:Record<string,unknown>){
 if(!BUFFER_KEY)throw new Error("buffer_api_key_missing");
 const res=await fetch("https://api.buffer.com",{method:"POST",headers:{"Authorization":"Bearer "+BUFFER_KEY,"Content-Type":"application/json"},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(22000)});
 const payload=await res.json().catch(()=>({}));
 if(!res.ok||payload.errors?.length)throw new Error("buffer_request_failed_"+res.status+"_"+String(payload.errors?.[0]?.extensions?.code||""));
 return payload.data;
}
async function channels(){
 const account=await gql("query{account{organizations{id,name}}}");
 const orgs=account?.account?.organizations||[];
 const list:Array<{organization_id:string,organization_name:string,channel_id:string,name:string,service:string,isQueuePaused:boolean}>=[];
 for(const org of orgs.slice(0,10)){
  const orgId=String(org.id);
  const details=await gql("query{channels(input:{organizationId:"+JSON.stringify(orgId)+"}){id,name,displayName,service,isQueuePaused}}");
  for(const c of details?.channels||[]){
   const service=String(c.service||"").toLowerCase();
   if(service==="tiktok")list.push({organization_id:orgId,organization_name:String(org.name||""),
    channel_id:String(c.id),name:String(c.displayName||c.name||""),service,isQueuePaused:!!c.isQueuePaused});
  }
 }
 return list;
}
async function run(req:Request){
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return respond({ok:false,error:"method_not_allowed"},405);
 if(!SUPA||!SVC)return respond({ok:false,error:"missing_supabase_environment"},503);
 const editor=await verifyAdmin(req);
 if(!editor)return respond({ok:false,error:"admin_login_required"},403);
 const body=await req.json().catch(()=>({}));
 const action=String(body.action||"status");
 const {data:cfg,error:e}=await db.from("giro_buffer_tiktok_settings").select("*").eq("id","giro_madeira").single();
 if(e)return respond({ok:false,error:"settings_not_found"},503);
 if(action==="status"){
  const {data:recent}=await db.from("giro_buffer_tiktok_jobs").select("id,source_queue_id,status,buffer_post_id,buffer_due_at,buffer_post_url,last_error,created_at").order("created_at",{ascending:false}).limit(12);
  return respond({ok:true,configured:!!BUFFER_KEY,enabled:cfg.enabled,dry_run:cfg.dry_run,channel_id:cfg.channel_id,channel_name:cfg.channel_name,daily_limit:cfg.daily_limit,min_interval_minutes:cfg.min_interval_minutes,tested:!!cfg.test_draft_post_id,test_draft_post_id:cfg.test_draft_post_id,history:recent||[]});
 }
 if(!BUFFER_KEY)return respond({ok:false,error:"configure_buffer_api_key_in_supabase_secrets"},503);
 if(action==="discover"){
  try{return respond({ok:true,channels:await channels()})}catch{return respond({ok:false,error:"cannot_reach_buffer_check_api_key"},502)}
 }
 if(action==="select"){
  const orgId=String(body.organization_id||""),chId=String(body.channel_id||"");
  if(!orgId||!chId)return respond({ok:false,error:"select_tiktok_channel"},400);
  let candidates;
  try{candidates=await channels()}catch{return respond({ok:false,error:"buffer_connection_failed"},502)}
  const found=candidates.find(c=>c.organization_id===orgId&&c.channel_id===chId);
  if(!found||found.isQueuePaused)return respond({ok:false,error:"channel_not_available_or_queue_paused"},400);
  // Changing channels always disables autopublishing and clears previous test.
  const {error:update}=await db.from("giro_buffer_tiktok_settings").update({
   organization_id:orgId,channel_id:chId,channel_name:found.name,
   enabled:false,dry_run:true,test_draft_post_id:null,last_verified_at:new Date().toISOString(),
   configured_by:editor,updated_at:new Date().toISOString()
  }).eq("id","giro_madeira");
  if(update)return respond({ok:false,error:"cannot_save_channel"},500);
  return respond({ok:true,selected:found.name,enabled:false});
 }
 if(action==="test_draft"){
  if(!cfg.organization_id||!cfg.channel_id)return respond({ok:false,error:"select_tiktok_channel_first"},409);
  if(cfg.enabled||!cfg.dry_run)return respond({ok:false,error:"pause_automation_first"},409);
  if(cfg.test_draft_post_id)return respond({ok:true,already_tested:true,test_draft_post_id:cfg.test_draft_post_id});
  const {data:queue,error:qe}=await db.from("giro_social_video_queue")
    .select("id,title,caption,video_url").eq("platform","youtube_shorts").eq("status","enviado")
    .eq("visual_review_status","approved").eq("editor_approved",true)
    .eq("provider_privacy_status","public").not("provider_post_id","is",null)
    .gte("shorts_rendered_at",new Date(Date.now()-24*3600000).toISOString())
    .order("shorts_rendered_at",{ascending:false}).limit(1);
  if(qe||!queue?.length)return respond({ok:false,error:"no_verified_video_available_for_test"},409);
  const row=queue[0];
  if(!String(row.video_url).startsWith(SUPA+"/storage/v1/object/public/news-videos/shorts/"))return respond({ok:false,error:"invalid_public_mp4"},422);
  const input={channelId:cfg.channel_id,schedulingType:"automatic",mode:"addToQueue",
   saveToDraft:true, text:"TESTE DE INTEGRAÇÃO • "+String(row.title).slice(0,145),
   assets:[{video:{url:row.video_url}}]};
  try{
   const result=await gql("mutation($input:CreatePostInput!){createPost(input:$input){... on PostActionSuccess{post{id,status}} ... on MutationError{message}}}",{input});
   const remote=result?.createPost;
   if(!remote?.post?.id)return respond({ok:false,error:"buffer_draft_rejected",detail:String(remote?.message||"").slice(0,140)},422);
   const postId=String(remote.post.id);
   const {error:up}=await db.from("giro_buffer_tiktok_settings").update({
      test_draft_post_id:postId,last_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()
   }).eq("id","giro_madeira");
   if(up)return respond({ok:false,error:"buffer_draft_created_but_local_state_unknown_check_buffer",post_id:postId},500);
   return respond({ok:true,draft_created:true,buffer_post_id:postId,note:"draft_only_not_public"});
  }catch{return respond({ok:false,error:"buffer_test_outcome_uncertain_check_buffer_before_retry"},502)}
 }
 if(action==="activate"){
  if(body.confirm!=="YES_I_REVIEWED_THE_DRAFT")return respond({ok:false,error:"confirm_draft_review_first"},400);
  if(!cfg.test_draft_post_id||!cfg.channel_id||!cfg.organization_id)return respond({ok:false,error:"configure_and_test_first"},409);
  let candidates;
  try{candidates=await channels()}catch{return respond({ok:false,error:"buffer_connection_failed"},502)}
  if(!candidates.some(c=>c.channel_id===cfg.channel_id&&c.organization_id===cfg.organization_id&&!c.isQueuePaused))
   return respond({ok:false,error:"target_tiktok_channel_unavailable"},409);
  const {error:up}=await db.from("giro_buffer_tiktok_settings").update({enabled:true,dry_run:false,updated_at:new Date().toISOString()}).eq("id","giro_madeira");
  if(up)return respond({ok:false,error:"activation_failed"},500);
  return respond({ok:true,enabled:true,post_by:"buffer_automatic_queue"});
 }
 if(action==="pause"){
  const {error:up}=await db.from("giro_buffer_tiktok_settings").update({enabled:false,dry_run:true,updated_at:new Date().toISOString()}).eq("id","giro_madeira");
  if(up)return respond({ok:false,error:"pause_failed"},500);
  return respond({ok:true,enabled:false});
 }
 return respond({ok:false,error:"action_not_supported"},400);
}
Deno.serve(async r=>{try{return await run(r)}catch{return respond({ok:false,error:"unexpected_error"},500)}});
