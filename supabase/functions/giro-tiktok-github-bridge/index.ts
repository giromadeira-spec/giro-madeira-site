import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { jwtVerify, createRemoteJWKSet } from "npm:jose@6.0.11";

const owner = "giromadeira-spec/giro-madeira-site";
const workflow = owner+"/.github/workflows/giro-tiktok-producao.yml@refs/heads/main";
const repoId = "1403695629";
const scope = "https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/giro-tiktok-github-bridge";
const jwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const response=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
Deno.serve(async req=>{
 if(req.method!=="POST")return response({success:false,error:"method_not_allowed"},405);
 const authorization=req.headers.get("Authorization")||"";
 if(!authorization.startsWith("Bearer "))return response({success:false,error:"github_oidc_missing"},401);
 let jwt:any;
 try{
   const verified=await jwtVerify(authorization.slice(7),jwks,{
     issuer:"https://token.actions.githubusercontent.com",audience:scope,
     algorithms:["RS256"],clockTolerance:15
   });
   jwt=verified.payload;
   if(jwt.repository!==owner || String(jwt.repository_id)!==repoId ||
      jwt.ref!=="refs/heads/main" || jwt.workflow_ref!==workflow ||
      jwt.event_name!=="schedule" && jwt.event_name!=="workflow_dispatch")
      throw Error("github_claims_mismatch");
 }catch{return response({success:false,error:"github_identity_not_authorized"},403);}
 const jobId=String(jwt.run_id||"")+"."+String(jwt.run_attempt||"1");
 const url=Deno.env.get("SUPABASE_URL")||"";
 const svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!svc)return response({success:false,error:"server_configuration_missing"},503);
 const db=createClient(url,svc,{auth:{persistSession:false}});
 const reqBody=await req.json().catch(()=>({}));
 const action=String(reqBody.action||"status");
 
 try{
  const {data:settings,error:settingsError}=await db.from("giro_tiktok_editorial_settings")
     .select("daily_goal,shorts_render_enabled,visual_template_version,editorial_queue_enabled")
     .eq("id","giro_madeira").single();
  if(settingsError)throw settingsError;
  const lane=await db.from("giro_channel_settings").select("preparation_enabled").eq("channel","tiktok").single();
  if(lane.error)throw lane.error;
  if(!lane.data.preparation_enabled)return response({success:true,processed:0,reason:"preparation_disabled"});
  if(action==="status")return response({success:true,mode:"github_oidc",renderer_enabled:settings.shorts_render_enabled,daily_goal:settings.daily_goal});
  if(!["claim","complete","fail"].includes(action))return response({success:false,error:"invalid_action"},400);
  if(!settings.shorts_render_enabled)return response({success:true,processed:0,reason:"renderer_disabled"});
  if(action==="claim"){
    const yesterday=new Date(Date.now()-36*3600000).toISOString();
    // Keep the day's first Short ahead of stale videos queued on previous days.
    const pvh=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
      timeZone:"America/Porto_Velho",year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(new Date()).map(part=>[part.type,part.value]));
    const todayInPortoVelho=new Date(Date.UTC(
      Number(pvh.year),Number(pvh.month)-1,Number(pvh.day),4,0,0
    )).toISOString();
    const {data:items,error:qe}=await db.from("giro_social_video_queue")
      .select("id,source_id,title,caption,source_url,scene_cards,topic_scope,scheduled_for")
      .eq("platform","tiktok").eq("source_kind","radar")
      .eq("status","pronto_para_revisao")
      .eq("storyboard_status","preparado")
      .eq("visual_review_status","pending")
      .eq("shorts_render_version",0).is("provider_post_id",null)
      .gte("created_at",yesterday).gte("scheduled_for",new Date(Date.parse(todayInPortoVelho)-6*3600000).toISOString())
      .lte("scheduled_for",new Date(Date.now()+2*3600000).toISOString())
      .order("scheduled_for",{ascending:true}).limit(8);
    if(qe)throw qe;
    for(const item of items||[]){
      const scenes=item.scene_cards;
      const finite=/(?<![\p{L}])(é|são|foi|foram|está|estão|estava|estavam|tem|têm|teve|terá|há|haverá|pode|podem|poderá|deve|devem|será|serão|disse|diz|afirma|afirmou|anunciou|determinou|determina|decidiu|decide|investiga|investigam|investigou|prendeu|prenderam|registra|registrou|cai|caiu|subiu|sobe|chega|chegou|fez|faz|marca|marcou|dará|fará|reduziu|aumentou|planeja|planejam|recebeu|recebe|aponta|apontou|deixa|deixou|ocorreu|ocorre|difere|privatizará|ficou|ficaram|mantém|confirmou|confirma|realizará|realizou|retotalizará|atingiu|atinge|segue|seguem|retoma|retomou|apresenta|apresentou|explica|explicou|destaca|destacou|aprova|aprovou|rejeita|rejeitou|começa|começou|trabalham|trabalhou|atuam|atua|traz|trouxe|anula|anulou|lançou|lança|prevê|previu|define|definiu|obriga|obrigou|aciona|acionou|renova|renovam|renovaram|remove|removem|removeram|liberou|liberaram|garantiu|garantem|bloqueia|bloqueou|paralisa|paralisou|interrompe|interromperá|retorna|retornarão|afeta|afetará|registram|registraram|fica|ficará|indica|indicou|publicou|divulgou|desmentiu|provocou|adiou|retirou|enfrenta|sofreu|alertou|alerta|suspende|suspendeu|revela|revelou|prorroga|prorrogou|expande|amplia|vence|venceu|vencem|venceram|derrota|derrotou|goleia|goleou|golearam|empata|empatou|empataram|perde|perdeu|perderam|eliminou|elimina|eliminaram|classificou|classificaram|avancou|avancaram|terminou|terminaram|vitória|vitoria|informa|informou)(?![\p{L}])/iu;
      if(!Array.isArray(scenes)||scenes.some(v=>!finite.test(String(v))))continue;

      if(!Array.isArray(scenes)||scenes.length!==3 ||
         scenes.some(s=>typeof s!=="string" || s.length<25 || s.length>130))continue;
      const title=String(item.title||"");
      if(!title || title.length<28 || title.length>160)continue;
      const sourceUrl=String(item.source_url||"");
      if(!/^https:\/\//.test(sourceUrl))continue;
      const {data:pub}=await db.from("giro_radar_tiktok")
        .select("id,fonte_id,url,score,created_at").eq("id",item.source_id).maybeSingle();
      if(!pub || pub.url!==sourceUrl || Number(pub.score||0)<25)continue;
      if(scenes.some(s=>/é redator|produção jornalística|conteúdos para plataformas digitais|biografia|sobre o autor/i.test(String(s))))continue;
      const {data:source}=await db.from("giro_madeira_fontes")
        .select("nome").eq("id",pub.fonte_id).maybeSingle();
      const uuid=crypto.randomUUID();
      const path="shorts/tiktok-original/"+String(item.source_id)+"/"+uuid+".mp4";
      const {data:claim,error:claimError}=await db.from("giro_social_video_queue").update({
        status:"aguardando_autorizacao",shorts_render_job_id:jobId,
        shorts_render_claimed_at:new Date().toISOString(),shorts_render_storage_path:path,
        shorts_render_error:null,updated_at:new Date().toISOString()
      }).eq("id",item.id).eq("status","pronto_para_revisao")
        .eq("shorts_render_version",0).eq("visual_review_status","pending")
        .is("provider_post_id",null).select("id").maybeSingle();
      if(claimError)throw claimError;
      if(!claim)continue;
      const signed=await db.storage.from("news-videos").createSignedUploadUrl(path);
      if(signed.error||!signed.data){
        await db.from("giro_social_video_queue").update({
           status:"falha",shorts_render_error:"signed_upload_creation_failed"
        }).eq("id",item.id).eq("shorts_render_job_id",jobId);
        return response({success:false,error:"upload_slot_failed"},503);
      }
      const uploadUrl=new URL(signed.data.signedUrl,url).toString();
      if(new URL(uploadUrl).origin!==new URL(url).origin)
        throw Error("invalid_upload_origin");
      return response({success:true,processed:1,queue_id:item.id,source_id:item.source_id,
         title,scenes,topic_scope:item.topic_scope,source_url:sourceUrl,
         source_name:source?.nome||"Fonte original",storage_path:path,upload_url:uploadUrl,
         brand_logo_url:"https://raw.githubusercontent.com/giromadeira-spec/giro-madeira-site/main/assets/logo-oficial.webp",
         river_sample_video_url:url+"/storage/v1/object/public/news-videos/shorts/551/1791494145636-giro-madeira-short-tre-rj-2026-10-08.mp4",
         target_duration:27, visual_template_version:settings.visual_template_version});
    }
    return response({success:true,processed:0,reason:"no_verified_storyboard_due"});
  }
  const id=Number(reqBody.queue_id||0);
  if(!Number.isSafeInteger(id)||id<1)return response({success:false,error:"invalid_queue_id"},400);
  const {data:row,error:re}=await db.from("giro_social_video_queue")
    .select("id,status,shorts_render_job_id,shorts_render_storage_path,shorts_render_version,provider_post_id")
    .eq("id",id).eq("platform","tiktok").maybeSingle();
  if(re)throw re;
  if(!row||row.shorts_render_job_id!==jobId || row.status!=="aguardando_autorizacao"||
    row.provider_post_id||!row.shorts_render_storage_path)
    return response({success:false,error:"render_claim_not_owned"},409);
  if(action==="fail"){
    await db.from("giro_social_video_queue").update({
       status:"falha",shorts_render_error:"renderer_failed_or_unlicensed_image",updated_at:new Date().toISOString()
    }).eq("id",id).eq("shorts_render_job_id",jobId);
    return response({success:true,failed:true,queue_id:id});
  }
  const path=String(reqBody.storage_path||"");
  if(path!==row.shorts_render_storage_path)return response({success:false,error:"render_path_mismatch"},409);
  const {data:files,error:se}=await db.storage.from("news-videos").list(path.slice(0,path.lastIndexOf("/")+1),{
    limit:100,search:path.slice(path.lastIndexOf("/")+1)
  });
  if(se)throw se;
  const meta=(files||[]).find(o=>o.name===path.slice(path.lastIndexOf("/")+1));
  const size=Number(meta?.metadata?.size||0);
  if(!meta||size<100000||size>30*1024*1024)return response({success:false,error:"rendered_file_missing_or_invalid_size"},422);
  if(!(String(reqBody.image_credit||"")==="arte editorial original Giro Madeira — sem fotografia externa" || /^(?:image_\S|wikimedia_|openverse_|public_domain_)/.test(String(reqBody.image_credit||""))))
    return response({success:false,error:"image_credit_not_verified"},422);
  if(reqBody.quality_passed!==true)return response({success:false,error:"render_qa_not_passed"},422);
  const videoUrl=url+"/storage/v1/object/public/news-videos/"+path;
  const patch={
    video_url:videoUrl,
    status:"pronto_para_revisao",visual_review_status:"approved",editor_approved:true,
    shorts_render_version:settings.visual_template_version,
    shorts_render_origin:"tiktok_github_oidc_v1",
    shorts_image_credit:String(reqBody.image_credit).slice(0,450),
    shorts_rendered_at:new Date().toISOString(),shorts_render_error:null,
    updated_at:new Date().toISOString()
  };
  const {data:updated,error:ue}=await db.from("giro_social_video_queue").update(patch)
   .eq("id",id).eq("status","aguardando_autorizacao").eq("shorts_render_job_id",jobId)
   .is("provider_post_id",null).select("id").maybeSingle();
  if(ue)throw ue;
  if(!updated)return response({success:false,error:"render_completion_conflict"},409);
  return response({success:true,processed:1,queue_id:id,ready_to_publish:true});
 }catch(e){
  console.error("github shorts bridge:",e instanceof Error?e.name:"unknown");
  return response({success:false,error:"bridge_operation_failed"},500);
 }
});

