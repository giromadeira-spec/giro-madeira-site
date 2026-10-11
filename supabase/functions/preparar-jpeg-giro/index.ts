import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
const H={"Content-Type":"application/json"};
const ok=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
Deno.serve(async(req)=>{
  const url=Deno.env.get("SUPABASE_URL"),role=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!role)return ok({success:false,error:"Supabase env missing"},500);
  const sb=createClient(url,role);
  try{
    const key=req.headers.get("x-giro-db-key")||"";
    const auth=await sb.rpc("validar_giro_dispatch_key",{p_key:key});
    if(auth.error)throw auth.error;
    if(auth.data!==true)return ok({success:false,error:"Unauthorized"},401);
    const input=await req.json().catch(()=>({}));
    const channel=String(input.channel||'legacy');
    if(!['legacy','feed','stories','reels'].includes(channel))return ok({success:false,error:'invalid_channel'},400);
    const publicationTable=channel==='legacy'?'giro_madeira_publicacoes':'giro_publicacoes_'+channel;
    const id=Number(input.publication_id||input.id);
    if(!Number.isSafeInteger(id)||id<=0)return ok({success:false,error:"publication_id invalido"},400);
    const found=await sb.from(publicationTable).select("id,status,feed_image_url,image_url,story_image_url,instagram_media_id,instagram_story_media_id").eq("id",id).maybeSingle();
    if(found.error)throw found.error;
    if(!found.data)return ok({success:false,error:"Not found"},404);
    const item=found.data;
    const output:any={};
    for(const kind of ["feed","story"] as const){
      const key=kind==="feed"?"feed_image_url":"story_image_url";
      const raw=kind==="feed"?String(item.feed_image_url||item.image_url||""):String(item.story_image_url||"");
      if(!raw){
        if(kind==="story")continue;
        return ok({success:false,error:"Feed image missing"},422);
      }
      const u=new URL(raw);
      const prefix="/storage/v1/object/public/news-images/";
      if(u.protocol!=="https:"||u.host!==new URL(url).host||!u.pathname.startsWith(prefix))return ok({success:false,error:"Source URL is not official: "+kind},422);
      if(/\.jpe?g$/i.test(u.pathname)){
        output[key]=raw;
        if(kind==="feed")output.image_url=raw;
        continue;
      }
      if(!/\.png$/i.test(u.pathname))return ok({success:false,error:"Unsupported image type: "+kind},422);
      const path=decodeURIComponent(u.pathname.slice(prefix.length));
      const download=await sb.storage.from("news-images").download(path);
      if(download.error||!download.data)throw new Error("Download "+kind+": "+(download.error?.message||"no data"));
      const bytes=new Uint8Array(await download.data.arrayBuffer());
      if(bytes.length>20*1024*1024)throw new Error("Image too big");
      const img=await Image.decode(bytes);
      const expected=kind==="feed"?[1080,1080]:[1080,1920];
      if(img.width!==expected[0]||img.height!==expected[1])throw new Error("Invalid "+kind+" dimensions: "+img.width+"x"+img.height);
      const jpeg=await img.encodeJPEG(94);
      if(jpeg.length<10000||jpeg[0]!==255||jpeg[1]!==216)throw new Error("JPEG encode invalid: "+kind);
      const name=path.split("/").pop()!.replace(/\.png$/i,"");
      const jpgPath="auto/jpeg/"+channel+"/"+kind+"/"+name+".jpg";
      const up=await sb.storage.from("news-images").upload(jpgPath,jpeg,{contentType:"image/jpeg",upsert:true});
      if(up.error)throw new Error("JPEG upload "+kind+": "+up.error.message);
      const publicUrl=sb.storage.from("news-images").getPublicUrl(jpgPath).data.publicUrl;
      output[key]=publicUrl;
      if(kind==="feed")output.image_url=publicUrl;
    }
    if(Object.keys(output).length){
      const upd=await sb.from(publicationTable).update(output).eq("id",id);
      if(upd.error)throw upd.error;
    }
    return ok({success:true,id,converted:Object.keys(output),feed_jpeg:/\.jpe?g$/i.test(String(output.feed_image_url||"")),story_jpeg:/\.jpe?g$/i.test(String(output.story_image_url||""))});
  }catch(e){return ok({success:false,error:e instanceof Error?e.message:String(e)},500)}
});

