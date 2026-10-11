import { createClient } from "npm:@supabase/supabase-js@2";

const H={"Content-Type":"application/json"};
const WORKER_URL="https://giro-reels-worker-production.up.railway.app/render";

function tensionStyle(title:string,category:string,urgent:boolean){
  const s=(title+" "+category).toLowerCase();
  return urgent || /pol[ií]cia|pris[aã]o|preso|tr[aá]fico|opera[cç][aã]o|acidente|colis[aã]o|capota|inc[eê]ndio|alerta|urgente|alagamento|enchente|tempestade|homic|feminic/.test(s) ? "tension" : "news";
}

Deno.serve(async(req)=>{
  const url=Deno.env.get("SUPABASE_URL"),role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!role) return new Response(JSON.stringify({success:false,error:"Configuração Supabase ausente."}),{status:500,headers:H});
  const sb=createClient(url,role);
  try{
    const provided=req.headers.get("x-giro-db-key")||"";
    const {data:valid,error:authError}=await sb.rpc("validar_giro_dispatch_key",{p_key:provided});
    if(authError) throw authError;
    if(valid!==true) return new Response(JSON.stringify({success:false,error:"Unauthorized"}),{status:401,headers:H});

    const body=await req.json().catch(()=>({}));
    const channel=String(body?.channel||'legacy');
    if(!['legacy','feed','stories','reels'].includes(channel))return new Response(JSON.stringify({success:false,error:'invalid_channel'}),{status:400,headers:H});
    const publicationTable=channel==='legacy'?'giro_madeira_publicacoes':'giro_publicacoes_'+channel;
    const id=Number(body?.publication_id||body?.id);
    if(!id) return new Response(JSON.stringify({success:false,error:"publication_id obrigatório"}),{status:400,headers:H});

    const q=await sb.from(publicationTable)
      .select("id,titulo,categoria,urgente,story_image_url,video_url,publicar_reel,instagram_reel_media_id,instagram_media_id,status")
      .eq("id",id).maybeSingle();
    if(q.error) throw q.error;
    if(!q.data) return new Response(JSON.stringify({success:false,error:"Publicação não encontrada"}),{status:404,headers:H});
    if(body?.dry_run===true){
      const story=String(q.data.story_image_url||"");
      const priorVideo=String(q.data.video_url||"");
      return new Response(JSON.stringify({success:true,dry_run:true,no_render:true,no_publish:true,
        publication_id:id,reel_requested:q.data.publicar_reel===true,
        story_ready:story.startsWith(url+"/storage/v1/object/public/news-images/"),
        existing_video_ready:priorVideo.startsWith(url+"/storage/v1/object/public/news-videos/"),
        worker_configured:WORKER_URL.startsWith("https://"),
        already_published:!!q.data.instagram_reel_media_id,
        requires_official_template:true
      }),{headers:H});
    }
    // A Feed may publish before its Reel: protect only an already-published Reel.
    // Creating later Reel media must never change the confirmed Feed or Story IDs.
    if(q.data.instagram_reel_media_id)
      return new Response(JSON.stringify({success:false,error:"already_published_no_reel_regeneration"}),{status:409,headers:H});
    if(q.data.publicar_reel!==true)
      return new Response(JSON.stringify({success:true,skipped:true,id,reason:"reel_not_recommended"}),{headers:H});
    const priorVideo=String(q.data.video_url||"");
    // Auto-copied publisher footage has no recorded redistribution license.
    // Render an original Reel from the owned Story instead of treating it as ready.
    const copiedPublisherVideo=priorVideo.startsWith(url+"/storage/v1/object/public/news-videos/auto/"+id+"-")
      && /\.mp4(?:\?|$)/i.test(priorVideo);
    if(priorVideo&&!copiedPublisherVideo){
      return new Response(JSON.stringify({success:true,id,video_url:q.data.video_url,already_ready:true}),{headers:H});
    }

    const story=String(q.data.story_image_url||"");
    if(!story.startsWith(url+"/storage/v1/object/public/news-images/")){
      throw new Error("Story oficial 1080×1920 ausente.");
    }

    const {data:workerKey,error:keyError}=await sb.rpc("giro_reels_worker_key_get");
    if(keyError) throw keyError;
    if(!workerKey) throw new Error("Chave do worker de Reels ausente.");

    const wr=await fetch(WORKER_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-giro-worker-key":String(workerKey)},
      body:JSON.stringify({
        image_url:story,
        duration:8,
        style:tensionStyle(String(q.data.titulo||""),String(q.data.categoria||""),q.data.urgente===true)
      }),
      signal:AbortSignal.timeout(120000)
    });
    if(!wr.ok){
      const detail=await wr.text().catch(()=>"");
      throw new Error("Worker Reel HTTP "+wr.status+(detail?": "+detail.slice(0,500):""));
    }
    const ct=(wr.headers.get("content-type")||"").split(";")[0];
    if(ct!=="video/mp4") throw new Error("Worker retornou mídia inválida: "+ct);
    const ab=await wr.arrayBuffer();
    if(ab.byteLength<10000) throw new Error("Vídeo gerado inválido ou pequeno demais.");
    if(ab.byteLength>35*1024*1024) throw new Error("Vídeo gerado excede 35 MB.");

    const path=`auto/reels/${channel}/${id}-${Date.now()}.mp4`;
    const up=await sb.storage.from("news-videos").upload(path,new Uint8Array(ab),{contentType:"video/mp4",upsert:false});
    if(up.error) throw up.error;
    const publicUrl=sb.storage.from("news-videos").getPublicUrl(path).data.publicUrl;

    const upd=await sb.from(publicationTable).update({
      video_url:publicUrl,
      publicar_reel:true,
      reel_erro:null,
      media_pipeline_version:5,
      media_status:"feed_pronto"
    }).eq("id",id);
    if(upd.error) throw upd.error;

    return new Response(JSON.stringify({
      success:true,id,video_url:publicUrl,generated:true,bytes:ab.byteLength,
      width:1080,height:1920,duration:8,worker:"railway"
    }),{headers:H});
  }catch(e){
    return new Response(JSON.stringify({success:false,error:e instanceof Error?e.message:String(e)}),{status:500,headers:H});
  }
});
