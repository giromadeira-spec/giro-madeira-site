import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Giro Madeira: guarded public uploader; at most one verified video per invocation.
// Optional verified football-round extras are capped at three beyond the ordinary daily goal.
const respond = (payload: unknown, status=200) =>
  new Response(JSON.stringify(payload), {status,headers:{
    "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff"
  }});
const textBytes=(s:string)=>new TextEncoder().encode(s);
const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",textBytes(s)));
const decode64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const expectedChannel="UCvzAtpCtcIef5Tfw31RcknQ";

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return respond({success:false,error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const clientId=Deno.env.get("YOUTUBE_CLIENT_ID")||"";
  const clientSecret=Deno.env.get("YOUTUBE_CLIENT_SECRET")||"";
  if(!supabaseUrl||!svc||!clientId||!clientSecret)
    return respond({success:false,error:"missing_server_configuration"},503);
  const header=req.headers.get("x-giro-db-key")||"";
  if(!header) return respond({success:false,error:"unauthorized"},401);
  const db=createClient(supabaseUrl,svc,{auth:{persistSession:false}});
  const verified=await db.rpc("validar_giro_dispatch_key",{p_key:header});
  if(verified.error||verified.data!==true) return respond({success:false,error:"unauthorized"},401);
  const params=await req.json().catch(()=>({}));
  const action=String(params.action||"run");
  if(!["run","preview"].includes(action))return respond({success:false,error:"unsupported_action"},400);
  const {data:lane,error:laneError}=await db.from('giro_channel_settings').select('publication_enabled').eq('channel','shorts').single();
  if(laneError)return respond({success:false,error:'channel_settings_unavailable'},503);
  if(params.dry_run===true || !lane.publication_enabled)return respond({success:true,no_publish:true,channel:'shorts',publication_enabled:lane.publication_enabled,dry_run:params.dry_run===true});
  const {data:settings,error:settingError}=await db.from("giro_shorts_settings")
    .select("public_auto_uploads_enabled,daily_goal,min_interval_minutes,visual_template_version,render_worker_reviewed,football_bonus_enabled,football_bonus_max")
    .eq("id","giro_madeira").single();
  if(settingError)return respond({success:false,error:"settings_not_available"},503);
  if(!settings.public_auto_uploads_enabled || !settings.render_worker_reviewed)
    return respond({success:true,mode:"guarded_auto_upload",enabled:false,public_posted:false});
  // Any uncertain previous claim stops all retries until an operator investigates it.
  const {data:uncertain}=await db.from("giro_social_video_queue").select("id")
   .eq("platform","youtube_shorts").eq("shorts_render_origin","github_oidc_v1")
   .eq("status","aguardando_autorizacao").gt("shorts_render_version",0).is("provider_post_id",null).limit(1);
  if(uncertain?.length)return respond({success:true,processed:0,reason:"prior_upload_status_uncertain"});
  // An uploaded video with a provider ID but no independently confirmed public
  // state is also uncertain. Never upload a different item while it remains unresolved.
  const {data:unverifiedRecent,error:unverifiedError}=await db.from("giro_social_video_queue")
    .select("id,provider_post_id,provider_privacy_status,updated_at")
    .eq("platform","youtube_shorts").eq("status","enviado")
    .gte("updated_at",new Date(Date.now()-24*3600000).toISOString())
    .or("provider_privacy_status.is.null,provider_privacy_status.neq.public")
    .order("updated_at",{ascending:false}).limit(1);
  if(unverifiedError)return respond({success:false,error:"prior_privacy_verification_check_failed"},500);
  if(unverifiedRecent?.length)
    return respond({success:true,processed:0,reason:"prior_youtube_publication_unverified",
      queue_id:unverifiedRecent[0].id,public_posted:false});
  const dayParts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Porto_Velho",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  const localDayStart=new Date(Date.UTC(Number(dayParts.year),Number(dayParts.month)-1,Number(dayParts.day),4)).toISOString();
  const {data:recent,error:recentError}=await db.from("giro_social_video_queue")
    .select("id,updated_at").eq("platform","youtube_shorts").eq("status","enviado")
    .eq("provider_privacy_status","public")
    .gte("updated_at",localDayStart)
    .order("updated_at",{ascending:false}).limit(12);
  if(recentError)return respond({success:false,error:"daily_quota_check_failed"},500);
  // A football allowance exists ONLY for explicitly identified editorial bonuses in the queue.
  // No speculative event day increases the daily YouTube publication cap.
  const {data:bonusRows,error:bonusError}=await db.from("giro_social_video_queue")
    .select("id").eq("platform","youtube_shorts").eq("football_extra",true)
    .gte("scheduled_for",new Date(Date.now()-24*3600000).toISOString())
    .lte("scheduled_for",new Date(Date.now()+12*3600000).toISOString())
    .neq("status","falha").neq("status","expirado").limit(3);
  if(bonusError)return respond({success:false,processed:0,reason:"football_bonus_check_failed"},500);
  const footballAllowance=settings.football_bonus_enabled===true
    ?Math.min(3,settings.football_bonus_max||0,(bonusRows||[]).length):0;
  const effectiveDailyCap=settings.daily_goal+footballAllowance;
  if((recent||[]).length>=effectiveDailyCap)
    return respond({success:true,processed:0,reason:"daily_publication_limit",effective_daily_cap:effectiveDailyCap});
  const {data:last24h,error:last24hError}=await db.from("giro_social_video_queue")
    .select("id,updated_at").eq("platform","youtube_shorts").eq("status","enviado")
    .eq("provider_privacy_status","public")
    .gte("updated_at",new Date(Date.now()-24*3600000).toISOString())
    .order("updated_at",{ascending:false}).limit(1);
  if(last24hError)return respond({success:false,error:"min_spacing_check_failed"},500);
  if(last24h?.length && (Date.now()-new Date(last24h[0].updated_at).getTime())<settings.min_interval_minutes*60000)
    return respond({success:true,processed:0,reason:"min_spacing"});
  const pvhDateParts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:"America/Porto_Velho",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date()).map(part=>[part.type,part.value]));
  const currentPvhDay=new Date(Date.UTC(
    Number(pvhDateParts.year),Number(pvhDateParts.month)-1,Number(pvhDateParts.day),4,0,0
  )).toISOString();
  const {data:eligible,error:queueError}=await db.from("giro_social_video_queue")
    .select("id,source_id,platform,title,caption,source_url,video_url,topic_scope,status,editor_approved,visual_review_status,storyboard_status,shorts_render_version,shorts_render_origin,shorts_image_credit,provider_post_id,scheduled_for,created_at")
    .eq("platform","youtube_shorts").eq("status","pronto_para_revisao")
    .in("topic_scope",["brasil","mundo"])
    .eq("visual_review_status","approved").eq("editor_approved",true)
    .eq("shorts_render_origin","github_oidc_v1")
    .eq("storyboard_status","preparado").eq("shorts_render_version",settings.visual_template_version)
    .is("provider_post_id",null).gte("scheduled_for",currentPvhDay).lte("scheduled_for",new Date().toISOString())
    .gte("created_at",new Date(Date.now()-36*3600000).toISOString())
    .order("scheduled_for",{ascending:true}).limit(2);
  if(queueError)return respond({success:false,error:"queue_lookup_failed"},500);
  if(!eligible?.length)return respond({success:true,processed:0,reason:"no_eligible_v5_shorts"});
  const localRo=/\b(rondonia|porto velho|ji parana|ariquemes|vilhena|cacoal|guajara mirim|jaru|rolim de moura|pimenta bueno|candeias do jamari|em ro)\b/;
  const national=/\b(em todo o brasil|em todo o pais|todo territorio nacional|rodovias federais)\b/;
  const row=eligible.find((v:any)=>{
     const headline=String(v.title||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
     return !localRo.test(headline)||national.test(headline);
  });
  if(!row)return respond({success:true,processed:0,reason:"regional_headline_filtered"});
  const id=row.id;
  if(action==="preview")return respond({success:true,mode:"preview",queue_id:id,
     title:row.title,will_upload:false,privacy_status:"public",target_channel:"@GIROMADEIRA"});
  if(!(/^(wikimedia_|openverse_)/.test(String(row.shorts_image_credit||"")) || String(row.shorts_image_credit||"")==="arte editorial original Giro Madeira — sem fotografia externa"))
    return respond({success:false,error:"license_attribution_missing"},422);
  if(row.provider_post_id || row.shorts_render_version!==settings.visual_template_version)
    return respond({success:false,error:"already_uploaded_or_wrong_template"},409);
  const url=String(row.video_url||"");
  let videoPath="";
  try{
    const source=new URL(url);
    const expected=new URL(supabaseUrl);
    const prefix="/storage/v1/object/public/news-videos/shorts/auto/";
    if(source.protocol!=="https:"||source.origin!==expected.origin||!source.pathname.startsWith(prefix)||
       !/\.mp4$/i.test(source.pathname)) throw Error("invalid_video_source");
    videoPath="shorts/auto/"+decodeURIComponent(source.pathname.slice(prefix.length));
    if(!videoPath||videoPath.includes("..")||videoPath.includes("\\")) throw Error("invalid_video_path");
  } catch {return respond({success:false,error:"only_verified_shorts_bucket_video_mp4_supported"},422);}

  const connection=await db.from("giro_youtube_oauth_connection")
    .select("refresh_token_ciphertext,refresh_token_nonce,granted_scopes")
    .eq("id","giro_madeira").maybeSingle();
  if(connection.error||!connection.data) return respond({success:false,error:"youtube_not_connected"},409);
  if(!String(connection.data.granted_scopes).includes("youtube.upload")||
     !String(connection.data.granted_scopes).includes("youtube.readonly"))
    return respond({success:false,error:"youtube_scopes_missing"},409);
  let refreshToken="";
  try{
    const aes=await crypto.subtle.importKey("raw",
      await digest("giro-madeira/youtube/refresh-token/v1:"+clientSecret),
      {name:"AES-GCM"},false,["decrypt"]);
    const decrypted=await crypto.subtle.decrypt({
      name:"AES-GCM",iv:decode64(connection.data.refresh_token_nonce),
      additionalData:textBytes("giro_madeira")
    },aes,decode64(connection.data.refresh_token_ciphertext));
    refreshToken=new TextDecoder().decode(decrypted);
  }catch{return respond({success:false,error:"stored_youtube_refresh_token_unreadable"},409);}
  const refreshed=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,
      refresh_token:refreshToken,grant_type:"refresh_token"}),
    signal:AbortSignal.timeout(18000)
  }).catch(()=>null);
  if(!refreshed?.ok) return respond({success:false,error:"youtube_token_refresh_failed"},401);
  const access=String((await refreshed.json()).access_token||"");
  if(!access) return respond({success:false,error:"youtube_access_token_missing"},401);

  // Verify the current user has exactly the authorized Giro Madeira channel.
  const channel=await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",{
    headers:{Authorization:"Bearer "+access},signal:AbortSignal.timeout(12000)
  }).catch(()=>null);
  if(!channel?.ok) return respond({success:false,error:"youtube_channel_check_failed"},409);
  const channels=await channel.json();
  if(!Array.isArray(channels.items)||channels.items[0]?.id!==expectedChannel)
    return respond({success:false,error:"connected_youtube_channel_mismatch"},403);

  const file=await db.storage.from("news-videos").download(videoPath);
  if(file.error||!file.data) return respond({success:false,error:"video_file_not_available"},404);
  const blob=file.data;
  if(blob.size<100000||blob.size>30*1024*1024)
    return respond({success:false,error:"video_size_outside_allowed_range_10kb_to_35mb"},422);
  if(blob.type && !["video/mp4","application/octet-stream"].includes(blob.type))
    return respond({success:false,error:"video_mime_not_supported"},422);

  const claim=await db.from("giro_social_video_queue")
    .update({status:"aguardando_autorizacao",updated_at:new Date().toISOString(),last_error:null})
    .eq("id",id).eq("status","pronto_para_revisao").eq("editor_approved",true)
    .eq("shorts_render_origin","github_oidc_v1")
    .is("provider_post_id",null).select("id").maybeSingle();
  if(claim.error) return respond({success:false,error:"claim_failed"},500);
  if(!claim.data) return respond({success:false,error:"already_claimed"},409);

  let uploadStarted=false;
  try {
    const description=[String(row.caption||"").slice(0,3000),
       row.source_url ? "Fonte: "+String(row.source_url).slice(0,400) : "",
       row.shorts_image_credit ? "Imagem ilustrativa e crédito: "+String(row.shorts_image_credit).slice(0,400) : "",
       "#GiroMadeira #Shorts"].filter(Boolean).join("\n\n").slice(0,4800);
    const metadata={snippet:{
       title:String(row.title||"Notícia Giro Madeira").slice(0,100),
       description,categoryId:"25"
    },status:{privacyStatus:"public",containsSyntheticMedia:true,selfDeclaredMadeForKids:false}};
    const init=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{
      method:"POST",headers:{
        "Authorization":"Bearer "+access,"Content-Type":"application/json; charset=utf-8",
        "X-Upload-Content-Type":"video/mp4","X-Upload-Content-Length":String(blob.size)
      },body:JSON.stringify(metadata),signal:AbortSignal.timeout(20000)
    });
    if(!init.ok) throw Error("youtube_upload_session_error_http_"+init.status);
    const location=init.headers.get("Location")||"";
    const session=new URL(location);
    if(session.protocol!=="https:"||!["www.googleapis.com","youtube.googleapis.com"].includes(session.hostname))
      throw Error("invalid_youtube_upload_session");
    uploadStarted=true;
    const uploaded=await fetch(session,{
      method:"PUT",headers:{
        "Authorization":"Bearer "+access,"Content-Type":"video/mp4",
        "Content-Length":String(blob.size)
      },body:blob,signal:AbortSignal.timeout(120000)
    });
    if(!uploaded.ok) throw Error("youtube_upload_result_http_"+uploaded.status);
    const result=await uploaded.json();
    const videoId=String(result.id||"");
    if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))
      throw Error("youtube_upload_result_without_id");
    const postUrl="https://www.youtube.com/watch?v="+videoId;
    // A successful upload response is not independent publication verification.
    // Preserve the provider ID and an unverified state if the follow-up API read fails.
    let actualPrivacy="unknown";
    const checked=await fetch("https://www.googleapis.com/youtube/v3/videos?part=status&id="+encodeURIComponent(videoId),{
      headers:{"Authorization":"Bearer "+access},signal:AbortSignal.timeout(12000)
    }).catch(()=>null);
    if(checked?.ok){
      const response=await checked.json().catch(()=>null);
      actualPrivacy=String(response?.items?.find((item: {id?:string})=>item.id===videoId)?.status?.privacyStatus||"unknown");
    }
    if(!["public","private","unlisted"].includes(actualPrivacy))actualPrivacy="unknown";
    const updated=await db.from("giro_social_video_queue").update({
      status:"enviado",provider_post_id:videoId,provider_url:postUrl,
      provider_privacy_status:actualPrivacy,
      last_error:null,updated_at:new Date().toISOString()
    }).eq("id",id);
    if(updated.error) throw Error("youtube_post_uploaded_but_record_update_failed");
    return respond({success:true,queue_id:id,video_id:videoId,url:postUrl,
      requested_privacy:"public",actual_privacy:actualPrivacy,public_posted:actualPrivacy==="public"});
  } catch(e){
    const message=e instanceof Error?e.message:"youtube_upload_error";
    // If session started, the upload might have completed despite an interrupted response.
    // Never auto-retry, to avoid a duplicate Shorts upload.
    const uncertain=uploadStarted;
    await db.from("giro_social_video_queue").update({
      status:uncertain?"aguardando_autorizacao":"falha",
      last_error:uncertain?"result_uncertain_check_youtube_studio_before_retry":message,
      updated_at:new Date().toISOString()
    }).eq("id",id).is("provider_post_id",null);
    return respond({success:false,queue_id:id,error:uncertain?
      "upload_status_uncertain_manual_check_required":message,
      public_posted:false},502);
  }
});
