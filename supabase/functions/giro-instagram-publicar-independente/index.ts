import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const account="17841426644705819";
const types:Record<string,string>={feed:"IMAGE",stories:"STORIES",reels:"REELS"};
const ids:Record<string,string>={feed:"instagram_media_id",stories:"instagram_story_media_id",reels:"instagram_reel_media_id"};
function asset(value:string,url:string,bucket:string){try{const u=new URL(value);return u.origin===url&&u.pathname.startsWith('/storage/v1/object/public/'+bucket+'/')}catch{return false}}
Deno.serve(async req=>{
 if(req.method!=="POST")return response({success:false,error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const db=createClient(url,role,{auth:{persistSession:false}});
 try{
  const key=req.headers.get("x-giro-db-key")||"";
  const auth=await db.rpc("validar_giro_dispatch_key",{p_key:key});
  if(auth.error||auth.data!==true)return response({success:false,error:"unauthorized"},401);
  const body=await req.json().catch(()=>({})),channel=String(body.channel||"");
  if(!Object.hasOwn(types,channel))return response({success:false,error:"invalid_channel"},400);
  // Explicit owner-authorized test on 18 October; expires automatically.
  const manualTest=body.manual_test===true && Date.now()<Date.parse("2026-10-19T04:30:00Z");
  const cfg=await db.from('giro_channel_settings').select('publication_enabled').eq('channel',channel).single();
  if(cfg.error)throw cfg.error;
  const gate=await db.rpc('giro_instagram_semaforo_gate',{p_media_type:types[channel]});
  if(gate.error)throw gate.error;
  const meta=await db.from('giro_meta_rate_state').select('integrity_hold,rollout_stage,traffic_light_target,traffic_light_reel_test_enabled,traffic_light_story_test_enabled').eq('id',1).single();
  if(meta.error)throw meta.error;
  // Instagram begins at noon in Porto Velho. Feed is first (12:00-12:44),
  // then Reel (13:30-14:44), then Story (15:30-16:59). The Meta semaforo
  // enforces a variable 75-105 minute gap across ALL media types in yellow,
  // so three simultaneous 12:00 posts would violate established protections.
  // Separate media/IDs, 1 per format per day; missing approvals never bypassed.
  const localParts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Porto_Velho',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const localHour=Number(localParts.find(p=>p.type==='hour')?.value??-1);
  const localMinute=Number(localParts.find(p=>p.type==='minute')?.value??-1);
  const feedNoon=channel==='feed'&&localHour===12&&localMinute<45;
  const reelsAfterNoon=channel==='reels'&&
    ((localHour===13&&localMinute>=30)||localHour===14&&localMinute<45);
  const storiesAfterNoon=channel==='stories'&&
    ((localHour===15&&localMinute>=30)||localHour===16);
  // Late recovery is reserved for a fully QA-reviewed ChatGPT package; publication
  // windows before 17h and all Meta semaphore limits remain intact.
  const lateCatchup=localHour>=17&&localHour<22;
  const normalWindow=feedNoon||reelsAfterNoon||storiesAfterNoon;
  const allowedTime=normalWindow||lateCatchup;
  const reelsRecovery=(reelsAfterNoon||lateCatchup)&&meta.data.rollout_stage==='feed_only'&&
    meta.data.traffic_light_target==='amarelo'&&meta.data.traffic_light_reel_test_enabled===true;
  const storiesRecovery=(storiesAfterNoon||lateCatchup)&&meta.data.rollout_stage==='feed_only'&&
    meta.data.traffic_light_target==='amarelo'&&meta.data.traffic_light_story_test_enabled===true;
  const channelAllowed=channel==='feed'||meta.data.rollout_stage==='full'||
    (channel==='reels'&&reelsRecovery)||(channel==='stories'&&storiesRecovery);
  const sequencingOnly=gate.data?.reason==="Stories aguardam Feed e Reel recentes confirmados pela Meta.";
  const editorialWindowOnly=gate.data?.reason==="Fora da janela editorial de Porto Velho (06h às 23h30).";
  const gateDenied=gate.data?.allowed!==true && !(manualTest&&(sequencingOnly||editorialWindowOnly));
  const blocked=!cfg.data.publication_enabled||meta.data.integrity_hold===true||
    gateDenied||(!manualTest&&!channelAllowed)||
    (!manualTest&&!allowedTime);
  const blockedReasons=[
    !cfg.data.publication_enabled?"channel_publication_disabled":null,
    meta.data.integrity_hold===true?"meta_integrity_hold":null,
    gate.data?.allowed!==true?"meta_semaphore_denied":null,
    !channelAllowed?"rollout_channel_not_allowed":null,
    !allowedTime?"outside_editorial_publication_window":null
  ].filter(Boolean);
  if(body.dry_run===true||blocked)return response({success:true,channel,reason:body.dry_run===true?"dry_run":blockedReasons[0],blocked_reasons:blockedReasons,dry_run:body.dry_run===true,no_publish:true,publication_enabled:cfg.data.publication_enabled,gate:gate.data,integrity_hold:meta.data.integrity_hold,rollout_stage:meta.data.rollout_stage});
  const table='giro_publicacoes_'+channel;
  // Do not try another item after a timeout/unknown provider result in this channel.
  const uncertain=await db.from(table).select('id')
    .or('status.eq.publicando,erro.eq.reconcile_provider_before_resend').limit(1).maybeSingle();
  if(uncertain.error)throw uncertain.error;
  if(uncertain.data)return response({success:true,channel,no_publish:true,reason:'reconciliation_required',publication_id:uncertain.data.id});
  let eligible=db.from(table).select('*').eq('status','aprovada').eq('visual_approved',true).gte('media_pipeline_version',channel==='feed'?6:5)
   .is(ids[channel],null).or('legenda.like.%Foto do acontecimento:%,legenda.like.%Foto de arquivo:%,legenda.like.%ILUSTRAÇÃO EDITORIAL ORIGINAL%')
    .gte('created_at',new Date(Date.now()-36*3600000).toISOString())
    .gt('editorial_expires_at',new Date().toISOString())
    .or('scheduled_at.is.null,scheduled_at.lte.'+new Date().toISOString())
;
  // An additional evening window cannot release old radar drafts or visual tests.
  if(lateCatchup&&!normalWindow)eligible=eligible.eq('auto_review_basis','chatgpt_asset_qa_v1');
  if(manualTest&&Number.isSafeInteger(Number(body.publication_id))&&Number(body.publication_id)>0)eligible=eligible.eq('id',Number(body.publication_id));
  const found=await eligible.order('urgente',{ascending:false}).order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(found.error)throw found.error;
  const item=found.data;
  if(!item)return response({success:true,channel,processed:0,no_publish:true,reason:"no_fresh_verified_media_eligible"});
  // Do not publish a late Reel before its own Feed, nor a late Story before
  // its own Reel. A status flag alone never proves delivery.
  if(lateCatchup&&!normalWindow&&channel!=='feed'){
    const bundle=await db.from('giro_chatgpt_pacotes').select('feed_id,reel_id,story_id')
      .eq(channel==='reels'?'reel_id':'story_id',item.id).maybeSingle();
    if(bundle.error)throw bundle.error;
    if(!bundle.data)return response({success:true,channel,no_publish:true,reason:'late_package_link_missing'});
    const beforeTable=channel==='reels'?'giro_publicacoes_feed':'giro_publicacoes_reels';
    const beforeId=channel==='reels'?bundle.data.feed_id:bundle.data.reel_id;
    const beforeCol=channel==='reels'?'instagram_media_id':'instagram_reel_media_id';
    const predecessor=await db.from(beforeTable).select('status,'+beforeCol).eq('id',beforeId).maybeSingle();
    if(predecessor.error)throw predecessor.error;
    if(predecessor.data?.status!=='publicada'||!predecessor.data?.[beforeCol])
      return response({success:true,channel,no_publish:true,reason:'late_predecessor_not_confirmed'});
  }
  if(Date.parse(item.editorial_expires_at||'')<Date.now()||Date.parse(item.created_at)<Date.now()-36*3600000){
   await db.from(table).update({status:'descartada',erro:'editorial_expired'}).eq('id',item.id).eq('status','aprovada');
   return response({success:true,channel,no_publish:true,reason:'editorial_expired'});
  }
  // Original art is an explicitly separate, human-reviewed publication mode.
  // Media_status must be set by an authorized editorial review; this worker
  // NEVER changes an unreviewed draft to approved.
  const originalArt=String(item.legenda||'').includes('ILUSTRAÇÃO EDITORIAL ORIGINAL');
  const photoProof=/Foto (?:do acontecimento|de arquivo): /.test(String(item.legenda||''));
  const artReviewed=originalArt &&
    item.media_status===(channel==='feed'?'feed_ilustracao_revisada':
                          channel==='reels'?'reel_ilustracao_revisada':'stories_ilustracao_revisada');
  const photoReviewed=photoProof && !originalArt &&
    (channel!=='feed'||item.media_status==='feed_foto_verificada') &&
    (channel!=='stories'||item.media_status==='stories_foto_verificada');
  if(!artReviewed&&!photoReviewed)
    return response({success:true,channel,no_publish:true,reason:'media_provenance_or_human_review_missing'});
  if(channel==='reels'&&(
    item.publicar_reel!==true||item.publicar_story===true||
    !String(item.story_image_url||'').startsWith(url+'/storage/v1/object/public/news-images/')||
    !String(item.video_url||'').endsWith('.mp4')||
    !String(item.legenda||'').includes('Fonte: ')||
    !String(item.legenda||'').includes('Matéria original: ')
  ))return response({success:true,channel,no_publish:true,reason:'reel_editorial_contract_failed'});
  const duplicate=await db.from('giro_madeira_publicacoes').select('id').eq('fonte_url',item.fonte_url).not(ids[channel],'is',null).limit(1);
  if(duplicate.error)throw duplicate.error;
  if(duplicate.data?.length){await db.from(table).update({status:'descartada',erro:'legacy_already_published'}).eq('id',item.id);return response({success:true,channel,no_publish:true,reason:'already_published'});}
  const media=String(channel==='feed'?item.feed_image_url||item.image_url:channel==='stories'?item.story_image_url:item.video_url||'');
  if(!asset(media,url,channel==='reels'?'news-videos':'news-images')||(channel!=='reels'&&!/\.jpe?g$/i.test(new URL(media).pathname)))return response({success:true,channel,no_publish:true,reason:'approved_provider_media_required'});
  // Never publish a Feed JPEG as a Story: require that format's OWN vertical render.
  if(channel==='stories'&&!media.startsWith(url+'/storage/v1/object/public/news-images/auto/jpeg/stories/story/'))
    return response({success:true,channel,no_publish:true,reason:'vertical_story_specific_media_required'});
  if(channel!=='stories'&&!String(item.legenda||'').trim())return response({success:true,channel,no_publish:true,reason:'caption_missing'});
  const reserved=await db.from(table).update({status:'publicando'}).eq('id',item.id).eq('status','aprovada').is(ids[channel],null).select('id').maybeSingle();
  if(reserved.error)throw reserved.error;
  if(!reserved.data)return response({success:true,channel,processed:0,reason:'already_reserved'});
  const payload:any={instagram_account_id:account,media_type:types[channel],manual_test:manualTest};
  if(channel==='reels'){payload.video_url=media;payload.caption=item.legenda;payload.share_to_feed=false;}
  else {payload.image_url=media;if(channel==='feed')payload.caption=item.legenda;}
  try{
   const sent=await fetch(url+'/functions/v1/publicar-instagram',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+role},body:JSON.stringify(payload),signal:AbortSignal.timeout(130000)});
   const result=await sent.json().catch(()=>({}));
   if(!sent.ok||result.success!==true||!result.instagram_media_id)throw Error('provider_response_requires_reconciliation');
   const saved=await db.from(table).update({status:'publicada',[ids[channel]]:String(result.instagram_media_id),published_at:new Date().toISOString(),erro:null}).eq('id',item.id).eq('status','publicando');
   if(saved.error)return response({success:false,channel,error:'confirmed_provider_id_not_saved',provider_id:result.instagram_media_id},500);
   return response({success:true,channel,publication_id:item.id,provider_id:result.instagram_media_id});
  }catch{
   // An ambiguous result is never retried automatically or reset to approved.
   await db.from(table).update({status:'erro',erro:'reconcile_provider_before_resend',media_status:'verificar_meta_antes_de_reenviar'}).eq('id',item.id).eq('status','publicando');
   return response({success:false,channel,error:'reconciliation_required'},502);
  }
 }catch(e){
  console.error(JSON.stringify({channel:"instagram",stage:"publish",error:e instanceof Error?e.name:"database_or_provider_error"}));
  return response({success:false,error:'independent_publish_failed',retry_allowed:false},500)
 }
});
