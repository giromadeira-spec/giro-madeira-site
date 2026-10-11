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
    .eq("status","pendente").eq("visual_approved",false).lt("preparation_attempts",2)
    .or("preparation_retry_at.is.null,preparation_retry_at.lte."+new Date().toISOString())
    .gte("created_at",new Date(Date.now()-36*3600000).toISOString())
    .order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(pe)throw pe;
  if(body.dry_run===true||!cfg.preparation_enabled)return response({success:true,dry_run:body.dry_run===true,channel,no_publish:true,preparation_enabled:cfg.preparation_enabled,pending_id:pending?.id||null,visual_contract:cfg.visual_contract});
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
   await db.from(table).update({erro:String(result.error||"media_preparation_failed").slice(0,500),media_status:"erro_midia"}).eq("id",item.id).eq("visual_approved",false);
   return response({success:false,channel,publication_id:item.id,no_publish:true,error:"media_preparation_failed"},502);
  }
  let videoReady=false;
  if(channel==="reels"&&result.reel_recommended===true&&!result.needs_approved_art){
   await db.from(table).update({publicar_reel:true,publicar_story:false}).eq("id",item.id);
   const reel=await fetch(url+"/functions/v1/gerar-reel-giro",{method:"POST",headers:{"Content-Type":"application/json","x-giro-db-key":key},body:JSON.stringify({publication_id:item.id,channel}),signal:AbortSignal.timeout(130000)});
   const rd=await reel.json().catch(()=>({}));videoReady=reel.ok&&rd.success===true&&!!rd.video_url;
   if(!videoReady)await db.from(table).update({reel_erro:String(rd.error||"video_pending").slice(0,500)}).eq("id",item.id);
  }
  // Each format has its own row, approval and lifecycle. No automatic visual approval.
  const status=result.needs_approved_art?"aguardando_arte_tematica":channel==="reels"&&!videoReady?"aguardando_reel":"aguardando_revisao_visual";
  const saved=await db.from(table).update({status:"pendente",media_status:status,media_pipeline_version:5,publicar_story:channel==="stories",publicar_reel:channel==="reels"&&result.reel_recommended===true})
    .eq("id",item.id).eq("visual_approved",false);
  if(saved.error)throw saved.error;
  return response({success:true,channel,publication_id:item.id,processed:1,no_publish:true,media_status:status,video_ready:videoReady,awaiting_visual_approval:true});
 }catch{return response({success:false,error:"independent_preparation_failed",no_publish:true},500)}
});
