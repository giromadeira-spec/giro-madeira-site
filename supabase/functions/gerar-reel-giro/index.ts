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
    // Dedicated QA render; never changes publication records or posts to Instagram.
    // Strict engineering QA: private workflow, marked art, no queue changes or Meta API calls.
    if(body?.qa_render===true){
      if(channel!=="reels")return new Response(JSON.stringify({success:false,error:"qa_reels_only"}),{status:400,headers:H});
      const {data:workerKey,error:keyError}=await sb.rpc("giro_reels_worker_key_get");
      if(keyError||!workerKey)throw new Error("worker_key_unavailable");
      let preview=String(body?.preview_url||"");
      const prefix=url+"/storage/v1/object/public/news-images/previews/story-"+id+"-";
      if(body?.qa_smoke===true){
        const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">'+
          '<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#071526"/><stop offset="1" stop-color="#183e56"/></linearGradient></defs>'+
          '<rect width="1080" height="1920" fill="url(#bg)"/>'+
          '<path d="M64 260 L1016 260" stroke="#fbbf24" stroke-width="8"/>'+
          '<text x="64" y="155" fill="#ffffff" font-size="77" font-family="Anton">GIRO MADEIRA</text>'+
          '<text x="64" y="700" fill="#fbbf24" font-size="92" font-family="Anton">PRÉVIA TÉCNICA</text>'+
          '<text x="64" y="860" fill="#ffffff" font-size="91" font-family="Anton">NÃO PUBLICAR</text>'+
          '<text x="64" y="1030" fill="#ffffff" font-size="41" font-family="Inter">Teste interno de renderização do MP4</text>'+
          '<text x="64" y="1110" fill="#ffffff" font-size="34" font-family="Inter">Sem notícia, imagem ou publicação real</text>'+
          '<path d="M0 1690 Q300 1645 570 1705 T1080 1665 L1080 1920 L0 1920Z" fill="#123a59"/>'+
          '<text x="64" y="1830" fill="#fbbf24" font-size="42" font-family="Inter">RIO MADEIRA • PORTO VELHO</text></svg>';
        const ar=await fetch("https://giro-reels-worker-production.up.railway.app/render-art",{
          method:"POST",headers:{"Content-Type":"application/json","x-giro-worker-key":String(workerKey)},
          body:JSON.stringify({svg}),signal:AbortSignal.timeout(90000)
        });
        if(!ar.ok)throw new Error("qa_art_worker_http_"+ar.status+":"+(await ar.text()).slice(0,220));
        if(!(ar.headers.get("content-type")||"").startsWith("image/png"))throw new Error("qa_art_invalid_content_type");
        const art=new Uint8Array(await ar.arrayBuffer());
        if(art.length<10000||art.length>16_000_000)throw new Error("qa_art_invalid_size");
        const path="previews/story-"+id+"-"+Date.now()+".png";
        const saved=await sb.storage.from("news-images").upload(path,art,{contentType:"image/png",upsert:false});
        if(saved.error)throw saved.error;
        preview=sb.storage.from("news-images").getPublicUrl(path).data.publicUrl;
      }
      if(!preview.startsWith(prefix)||!/^\d+\.png$/.test(preview.slice(prefix.length)))
        return new Response(JSON.stringify({success:false,error:"qa_requires_marked_preview"}),{status:400,headers:H});
      const wr=await fetch(WORKER_URL,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-giro-worker-key":String(workerKey)},
        body:JSON.stringify({image_url:preview,duration:8,style:"news"}),
        signal:AbortSignal.timeout(120000)
      });
      if(!wr.ok)throw new Error("qa_video_worker_http_"+wr.status+":"+(await wr.text()).slice(0,240));
      if(!(wr.headers.get("content-type")||"").startsWith("video/mp4"))
        throw new Error("qa_video_invalid_content_type");
      const bytes=new Uint8Array(await wr.arrayBuffer());
      if(bytes.length<10000||bytes.length>35*1024*1024)throw new Error("qa_video_invalid_size");
      const storagePath="qa/reels/"+id+"-"+Date.now()+".mp4";
      const upload=await sb.storage.from("news-videos").upload(storagePath,bytes,{contentType:"video/mp4",upsert:false});
      if(upload.error)throw upload.error;
      return new Response(JSON.stringify({
        success:true,qa_render:true,no_publish:true,not_for_publication:true,
        image_url:preview,
        video_url:sb.storage.from("news-videos").getPublicUrl(storagePath).data.publicUrl,
        video_bytes:bytes.length,publication_id:id,channel
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
