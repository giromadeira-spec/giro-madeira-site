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
  const cfg=await db.from('giro_channel_settings').select('publication_enabled').eq('channel',channel).single();
  if(cfg.error)throw cfg.error;
  const gate=await db.rpc('giro_instagram_semaforo_gate',{p_media_type:types[channel]});
  if(gate.error)throw gate.error;
  const meta=await db.from('giro_meta_rate_state').select('integrity_hold,rollout_stage,traffic_light_target,traffic_light_reel_test_enabled').eq('id',1).single();
  if(meta.error)throw meta.error;
  // Gradual restart for Reels ONLY: single daily attempt near 12:00 Porto Velho.
  // Stories remain blocked under feed_only. The central semaforo enforces 1/day,
  // the variable gap, Meta rate limits and integrity holds independently.
  const localParts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Porto_Velho',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const localHour=Number(localParts.find(p=>p.type==='hour')?.value??-1);
  const localMinute=Number(localParts.find(p=>p.type==='minute')?.value??-1);
  const reelsNoon=channel==='reels'&&localHour===12&&localMinute>=0&&localMinute<10;
  const reelsRecovery=reelsNoon&&meta.data.rollout_stage==='feed_only'&&
    meta.data.traffic_light_target==='amarelo'&&meta.data.traffic_light_reel_test_enabled===true;
  const channelAllowed=channel==='feed'||
    (channel==='reels'?reelsRecovery:meta.data.rollout_stage==='full');
  const blocked=!cfg.data.publication_enabled||meta.data.integrity_hold===true||
    gate.data?.allowed!==true||!channelAllowed||(channel==='reels'&&!reelsNoon);
  if(body.dry_run===true||blocked)return response({success:true,channel,dry_run:body.dry_run===true,no_publish:true,publication_enabled:cfg.data.publication_enabled,gate:gate.data,integrity_hold:meta.data.integrity_hold,rollout_stage:meta.data.rollout_stage});
  const table='giro_publicacoes_'+channel;
  const found=await db.from(table).select('*').eq('status','aprovada').eq('visual_approved',true).gte('media_pipeline_version',channel==='feed'?6:5)
   .is(ids[channel],null).like('legenda','%Foto do acontecimento:%').or('scheduled_at.is.null,scheduled_at.lte.'+new Date().toISOString())
   .order('urgente',{ascending:false}).order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(found.error)throw found.error;
  const item=found.data;
  if(!item)return response({success:true,channel,processed:0});
  if(Date.parse(item.editorial_expires_at||'')<Date.now()||Date.parse(item.created_at)<Date.now()-36*3600000){
   await db.from(table).update({status:'descartada',erro:'editorial_expired'}).eq('id',item.id).eq('status','aprovada');
   return response({success:true,channel,no_publish:true,reason:'editorial_expired'});
  }
  // Never auto-release unreviewed Reel imagery or media.
  if(channel==='reels'&&(
    item.publicar_reel!==true||item.publicar_story===true||
    !String(item.story_image_url||'').startsWith(url+'/storage/v1/object/public/news-images/')||
    !String(item.video_url||'').endsWith('.mp4')||
    !String(item.legenda||'').includes('Fonte: ')||
    !String(item.legenda||'').includes('Matéria original: ')||
    !String(item.legenda||'').includes('Foto do acontecimento: ')
  ))return response({success:true,channel,no_publish:true,reason:'reel_editorial_contract_failed'});
  if(!String(item.legenda||'').includes('Foto do acontecimento: '))return response({success:true,channel,no_publish:true,reason:'event_photo_provenance_required'});
  if(channel==='feed'&&item.media_status!=='feed_foto_verificada'){
   return response({success:true,channel,no_publish:true,reason:'v6_verified_photo_required'});
  }
  const duplicate=await db.from('giro_madeira_publicacoes').select('id').eq('fonte_url',item.fonte_url).not(ids[channel],'is',null).limit(1);
  if(duplicate.error)throw duplicate.error;
  if(duplicate.data?.length){await db.from(table).update({status:'descartada',erro:'legacy_already_published'}).eq('id',item.id);return response({success:true,channel,no_publish:true,reason:'already_published'});}
  const media=String(channel==='feed'?item.feed_image_url||item.image_url:channel==='stories'?item.story_image_url:item.video_url||'');
  if(!asset(media,url,channel==='reels'?'news-videos':'news-images')||(channel!=='reels'&&!/\.jpe?g$/i.test(new URL(media).pathname)))return response({success:true,channel,no_publish:true,reason:'approved_provider_media_required'});
  if(channel!=='stories'&&!String(item.legenda||'').trim())return response({success:true,channel,no_publish:true,reason:'caption_missing'});
  const reserved=await db.from(table).update({status:'publicando'}).eq('id',item.id).eq('status','aprovada').is(ids[channel],null).select('id').maybeSingle();
  if(reserved.error)throw reserved.error;
  if(!reserved.data)return response({success:true,channel,processed:0,reason:'already_reserved'});
  const payload:any={instagram_account_id:account,media_type:types[channel]};
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
 }catch{return response({success:false,error:'independent_publish_failed'},500)}
});
