import { registryReady, PHOTO_FIELDS } from "../_shared/photo-registry.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(req.method!=="POST")return response({success:false,error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!role)return response({success:false,error:"configuration_missing"},503);
 const db=createClient(url,role,{auth:{persistSession:false}});
 try{
  const key=req.headers.get("x-giro-db-key")||"";
  const auth=await db.rpc("validar_giro_dispatch_key",{p_key:key});
  if(auth.error||auth.data!==true)return response({success:false,error:"unauthorized"},401);
  const body=await req.json().catch(()=>({})),channel=String(body.channel||"");
  if(!["feed","stories","reels"].includes(channel))return response({success:false,error:"invalid_channel"},400);
  const table="giro_publicacoes_"+channel;
  const {data:cfg,error:ce}=await db.from("giro_channel_settings").select("*").eq("channel",channel).single();
  if(ce)throw ce;
  const {data:pending,error:pe}=await db.from(table).select("*")
    // Allow one extra, safe art-generation attempt after the original-art upgrade.
    // Previously blocked items remain drafts and still require editorial approval.
    .eq("status","pendente").eq("visual_approved",false).lt("preparation_attempts",3)
    // Completed media awaits review; it is not a render failure to regenerate.
    .not("media_status","in","(aguardando_revisao_visual,aguardando_verificacao_foto_e_licenca)")
    .or("preparation_retry_at.is.null,preparation_retry_at.lte."+new Date().toISOString())
    .gte("created_at",new Date(Date.now()-36*3600000).toISOString())
    .gt("editorial_expires_at",new Date().toISOString())
    // New, fresh stories first. Repeatedly failing old sources must not starve the queue.
    .order("preparation_attempts",{ascending:true}).order("urgente",{ascending:false})
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(pe)throw pe;
  if(body.dry_run===true||!cfg.preparation_enabled)return response({success:true,dry_run:body.dry_run===true,channel,no_publish:true,preparation_enabled:cfg.preparation_enabled,pending_id:pending?.id||null,visual_contract:cfg.visual_contract});
  // Old PRF illustrative-photo recovery disabled: topic match cannot prove an image depicts the event.
  let item=pending;
  if(!item){
   const claim=await db.rpc("giro_claim_editorial_independente",{p_channel:channel});
   if(claim.error)throw claim.error;
   const id=Number(claim.data||0);
   if(!id)return response({success:true,channel,processed:0,no_publish:true,reason:"no_due_eligible_story_or_channel_spacing"});
   const found=await db.from(table).select("*").eq("id",id).single();
   if(found.error)throw found.error;
   item=found.data;
  }
  const attempts=Number(item.preparation_attempts||0);
  const reserved=await db.from(table).update({preparation_attempts:attempts+1,preparation_retry_at:new Date(Date.now()+6*3600000).toISOString()})
    .eq("id",item.id).eq("preparation_attempts",attempts).eq("status","pendente").eq("visual_approved",false).select("id").maybeSingle();
  if(reserved.error)throw reserved.error;
  if(!reserved.data)return response({success:true,channel,processed:0,no_publish:true,reason:"already_reserved"});
  const render=await fetch(url+"/functions/v1/gerar-arte-noticia-vault",{
   method:"POST",headers:{"Content-Type":"application/json","x-giro-db-key":key},
   body:JSON.stringify({publication_id:item.id,channel,auto_pipeline:true}),signal:AbortSignal.timeout(120000)
  });
  const result=await render.json().catch(()=>({}));
  if(!render.ok||result.success!==true){
   const reason=String(result.error||"media_preparation_failed").slice(0,500);
   // Bad/inaccessible factual sources are not a video-publishing failure.
   // Skip them, preserve the audit reason and let the radar choose a new story.
   // Transient render/worker failures remain retryable.
   const sourceInvalid=/Fonte sem dados suficientes|Matéria não tem detalhes suficientes|Informações insuficientes|Descrição genérica do portal|Matéria vaga|Fonte editorialmente bloqueada/.test(reason);
   const saved=await db.from(table).update({
     status:sourceInvalid?"descartada":"pendente",
     erro:reason,media_status:sourceInvalid?"descartada_sem_fonte":"erro_midia"
   }).eq("id",item.id).eq("status","pendente").eq("visual_approved",false);
   if(saved.error)throw saved.error;
   return response({success:sourceInvalid,channel,publication_id:item.id,
     no_publish:true,skipped_invalid_source:sourceInvalid,
     error:sourceInvalid?"source_insufficient_skipped":"media_preparation_failed"},sourceInvalid?200:502);
  }
  if(result.needs_approved_art===true){
    return response({success:true,channel,publication_id:item.id,no_publish:true,
      reason:"event_photo_rights_review_required",source_image_url:result.source_image_url||null});
  }
  // The renderer produces editorial PNGs; Meta IMAGE/STORIES requires verified JPEG.
  // Conversion is a preparation step only and never counts as visual approval.
  if(result.needs_approved_art!==true){
   const supplied=String(result.feed_image_url||"");
   const story=String(result.story_image_url||"");
   if(!supplied.startsWith(url+"/storage/v1/object/public/news-images/")||
      !story.startsWith(url+"/storage/v1/object/public/news-images/")){
     await db.from(table).update({media_status:"erro_conversao_jpeg",erro:"rendered_media_missing_or_untrusted"}).eq("id",item.id).eq("visual_approved",false);
     return response({success:false,channel,publication_id:item.id,no_publish:true,error:"rendered_media_missing_or_untrusted"},502);
   }
   const transcode=await fetch(url+"/functions/v1/preparar-jpeg-giro",{
     method:"POST",headers:{"Content-Type":"application/json","x-giro-db-key":key},
     body:JSON.stringify({publication_id:item.id,channel}),signal:AbortSignal.timeout(90000)
   });
   const converted=await transcode.json().catch(()=>({}));
   if(!transcode.ok||converted.success!==true||converted.feed_jpeg!==true||converted.story_jpeg!==true){
     await db.from(table).update({
       media_status:"erro_conversao_jpeg",
       erro:String(converted.error||"approved_size_jpeg_not_ready").slice(0,500)
     }).eq("id",item.id).eq("visual_approved",false);
     return response({success:false,channel,publication_id:item.id,no_publish:true,error:"jpeg_conversion_failed"},502);
   }
  }
  let videoReady=false;
  if(channel==="reels"&&result.reel_recommended===true&&!result.needs_approved_art){
   await db.from(table).update({publicar_reel:true,publicar_story:false}).eq("id",item.id);
   const reel=await fetch(url+"/functions/v1/gerar-reel-giro",{method:"POST",headers:{"Content-Type":"application/json","x-giro-db-key":key},body:JSON.stringify({publication_id:item.id,channel}),signal:AbortSignal.timeout(130000)});
   const rd=await reel.json().catch(()=>({}));videoReady=reel.ok&&rd.success===true&&!!rd.video_url;
   if(!videoReady)await db.from(table).update({reel_erro:String(rd.error||"video_pending").slice(0,500)}).eq("id",item.id);
  }
  // Each channel owns its own approval and final media. In production, only
  // deterministic, self-authored graphics backed by an accessible official
  // Brazilian government article may pass the automated artwork contract.
  // Third-party photographs and inaccessible sources stay under human review.
  let autoApproved=false;
  let approvalReason="awaiting_visual_review";
  const photo=result.illustrative_photo_credit;
  let verifiedPhoto=false;
  try{
    const license=String(photo?.license||"");
    const u=new URL(String(photo?.source||""));
    verifiedPhoto=result.visual_mode==="original_event_photo"&&
      (license==="CC0"||/^CC BY(?: |$)/.test(license))&&
      ((u.hostname==="commons.wikimedia.org"&&u.pathname.startsWith("/wiki/File:"))||
       (u.hostname==="www.flickr.com"&&u.pathname.startsWith("/photos/")))&&
      String(photo?.creator||"").length>=2;
  }catch{}
  if(result.visual_mode==="registered_event_photo"&&Number.isSafeInteger(result.registered_image_id)){
    const registered=await db.from('giro_imagens_autorizadas').select(PHOTO_FIELDS)
      .eq('id',result.registered_image_id).eq('article_url',item.fonte_url).eq('headline',item.titulo).maybeSingle();
    if(registered.error)throw registered.error;
    verifiedPhoto=registryReady(registered.data);
  }
  if(channel==="feed"&&result.needs_approved_art!==true&&verifiedPhoto&&
     cfg.visual_contract==="GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V2"){
   const check=await db.from(table).select(
     "id,fonte_url,legenda,feed_image_url,story_image_url,editorial_expires_at,media_pipeline_version,status,visual_approved"
   ).eq("id",item.id).maybeSingle();
   if(check.error)throw check.error;
   const m=check.data;
   let official=false;
   try{const u=new URL(String(m?.fonte_url||""));official=u.protocol==="https:"&&u.hostname.endsWith(".gov.br")}catch{}
   const verified=official&&m?.status==="pendente"&&m.visual_approved===false&&
     Number(m.media_pipeline_version)===6&&Date.parse(String(m.editorial_expires_at||""))>Date.now()&&
     String(m.legenda||"").length>=400&&
     String(m.legenda||"").includes("Fonte: ")&&String(m.legenda||"").includes("Matéria original: ")&&
      String(m.legenda||"").includes("Foto do acontecimento: ")&&
      !String(m.legenda||"").includes("Imagem ilustrativa: ")&&
     String(m.feed_image_url||"").startsWith(url+"/storage/v1/object/public/news-images/auto/jpeg/feed/feed/")&&
     String(m.feed_image_url||"").endsWith(".jpg")&&
     String(m.story_image_url||"").startsWith(url+"/storage/v1/object/public/news-images/auto/jpeg/feed/story/")&&
     String(m.story_image_url||"").endsWith(".jpg");
   if(verified){
     const approved=await db.from(table).update({
       status:"aprovada",visual_approved:true,media_status:"feed_foto_verificada",
       scheduled_at:new Date().toISOString(),erro:null
     }).eq("id",item.id).eq("status","pendente").eq("visual_approved",false)
       .select("id").maybeSingle();
     if(approved.error)throw approved.error;
     autoApproved=!!approved.data;
     approvalReason=autoApproved?"event_photo_official_source_verified":"approval_conflict";
   }else approvalReason="official_source_or_media_contract_not_verified";
  }
  // Reels can be automatically approved ONLY after factual source extraction,
  // independently licensed editorial photography, JPEG conversion and MP4 render.
  // This never applies to an illustration awaiting review, a source with
  // insufficient content, copied footage or a media generation failure.
  if(channel==="reels"&&videoReady&&result.reel_recommended===true&&
     result.needs_approved_art!==true&&verifiedPhoto&&
     cfg.visual_contract==="GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1"){
   const check=await db.from(table).select(
     "id,fonte_url,legenda,story_image_url,video_url,editorial_expires_at,media_pipeline_version,status,visual_approved,publicar_story,publicar_reel,instagram_reel_media_id"
   ).eq("id",item.id).maybeSingle();
   if(check.error)throw check.error;
   const m=check.data;
   let sourceVerified=false;
   try{const u=new URL(String(m?.fonte_url||""));sourceVerified=u.protocol==="https:"&&!!u.hostname&&u.pathname.length>10}catch{}
   const verified=sourceVerified&&m?.status==="pendente"&&m.visual_approved===false&&
     m.publicar_reel===true&&m.publicar_story===false&&!m.instagram_reel_media_id&&
     Number(m.media_pipeline_version)===5&&
     Date.parse(String(m.editorial_expires_at||""))>Date.now()&&
     String(m.legenda||"").length>=330&&
     String(m.legenda||"").includes("Fonte: ")&&
     String(m.legenda||"").includes("Matéria original: ")&&
     String(m.legenda||"").includes("Foto do acontecimento: ")&&
     String(m.story_image_url||"").startsWith(url+"/storage/v1/object/public/news-images/auto/jpeg/reels/story/")&&
     /\.jpg$/.test(String(m.story_image_url||""))&&
     String(m.video_url||"").startsWith(url+"/storage/v1/object/public/news-videos/auto/reels/reels/")&&
     /\.mp4$/.test(String(m.video_url||""));
   if(verified){
     const approved=await db.from(table).update({
       status:"aprovada",visual_approved:true,media_status:"reel_validado",
       publicar_story:false,publicar_reel:true,scheduled_at:new Date().toISOString(),erro:null
     }).eq("id",item.id).eq("status","pendente").eq("visual_approved",false)
       .is("instagram_reel_media_id",null).select("id").maybeSingle();
     if(approved.error)throw approved.error;
     autoApproved=!!approved.data;
     approvalReason=autoApproved?"reels_event_photo_and_mp4_verified":"approval_conflict";
   }else approvalReason="reels_editorial_media_contract_not_verified";
  }
  if(!autoApproved){
   const status=result.needs_approved_art?"aguardando_verificacao_foto_e_licenca":
     channel==="reels"&&!videoReady?"aguardando_reel":"aguardando_revisao_visual";
   const saved=await db.from(table).update({
     status:"pendente",media_status:status,media_pipeline_version:channel==="feed"?6:5,
     publicar_story:channel==="stories",
     publicar_reel:channel==="reels"&&result.reel_recommended===true
   }).eq("id",item.id).eq("visual_approved",false);
   if(saved.error)throw saved.error;
   return response({success:true,channel,publication_id:item.id,processed:1,no_publish:true,
     media_status:status,video_ready:videoReady,awaiting_visual_approval:true,
     auto_qa:approvalReason});
  }
  return response({success:true,channel,publication_id:item.id,processed:1,
    media_status:channel==="reels"?"reel_validado":"feed_foto_verificada",
    auto_approved:true,auto_qa:approvalReason,verified_artwork_only:true,
    publication_not_attempted:true});
 }catch{return response({success:false,error:"independent_preparation_failed",no_publish:true},500)}
});
