import http from "node:http";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const WORKER_KEY = String(process.env.WORKER_KEY || "");
const ALLOWED_HOST = "dsihvbdhocbqscaypraw.supabase.co";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "content-type": "application/json", "content-length": data.length });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function execFfmpeg(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg_timeout"));
    }, timeoutMs);
    proc.stderr.on("data", (d) => {
      if (stderr.length < 12000) stderr += d.toString();
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error("ffmpeg_exit_" + code + ": " + stderr.slice(-6000)));
    });
  });
}

function validateImageUrl(raw) {
  const u = new URL(String(raw || ""));
  if (u.protocol !== "https:" || u.host !== ALLOWED_HOST) throw new Error("invalid_image_host");
  if (!u.pathname.startsWith("/storage/v1/object/public/news-images/")) throw new Error("invalid_image_path");
  return u.toString();
}

function audioExpr(style) {
  if (style === "tension") {
    return "0.025*sin(2*PI*55*t)+0.014*sin(2*PI*82.41*t)+0.008*sin(2*PI*110*t)";
  }
  return "0.018*sin(2*PI*98*t)+0.012*sin(2*PI*146.83*t)+0.006*sin(2*PI*196*t)";
}

async function renderVideo(body) {
  const imageUrl = validateImageUrl(body.image_url);
  const style = body.style === "tension" ? "tension" : "news";
  const secs = Math.max(4, Math.min(12, Number(body.duration) || 8));
  const id = randomUUID();
  const input = "/tmp/" + id + ".png";
  const output = "/tmp/" + id + ".mp4";

  try {
    const ir = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!ir.ok) throw new Error("image_http_" + ir.status);
    const ab = await ir.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) throw new Error("image_too_large");
    await fs.writeFile(input, Buffer.from(ab));

    const vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p";

    const args = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-loop", "1", "-framerate", "15", "-i", input,
      "-f", "lavfi", "-i", "aevalsrc=" + audioExpr(style) + ":s=44100:d=" + secs,
      "-vf", vf,
      "-r", "15",
      "-t", String(secs),
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "25",
      "-profile:v", "main", "-level", "4.0", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "80k",
      "-movflags", "+faststart", "-shortest",
      output
    ];
    await execFfmpeg(args);
    const out = await fs.readFile(output);
    if (out.length < 10000) throw new Error("video_too_small");
    return out;
  } finally {
    await Promise.allSettled([fs.unlink(input), fs.unlink(output)]);
  }
}


function wrapForShort(value, maxLine=28, maxLines=4) {
  const words=String(value||"").replace(/[\r\n]+/g," ").replace(/\s+/g," ").trim().split(" ");
  const lines=[];
  let line="";
  for(const word of words){
    if(!word) continue;
    if(word.length > maxLine) throw new Error("scene_word_too_long");
    if((line+" "+word).trim().length > maxLine){
      if(line) lines.push(line);
      line=word;
    } else line=(line+" "+word).trim();
  }
  if(line) lines.push(line);
  if(lines.length>maxLines || lines.length===0) throw new Error("scene_text_too_long");
  return lines.join("\n");
}

async function renderShortVideo(body) {
  const imageUrl=validateImageUrl(body.image_url);
  const scenes=Array.isArray(body.scenes)?body.scenes:[];
  if(scenes.length!==3 || scenes.some(x=>typeof x!=="string" || x.trim().length<20 || x.trim().length>115)){
    throw new Error("exactly_three_verified_fact_scenes_required");
  }
  const duration=Number(body.duration ?? 27);
  if(!Number.isInteger(duration)||duration<22||duration>36) throw new Error("duration_out_of_range");
  const style=body.style==="tension"?"tension":"news";
  const id=randomUUID(), image="/tmp/"+id+".png", output="/tmp/"+id+".mp4";
  const cards=scenes.map((_,i)=>"/tmp/"+id+"-card-"+i+".txt");
  const font="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  try{
    const ir=await fetch(imageUrl,{signal:AbortSignal.timeout(20000)});
    if(!ir.ok)throw new Error("image_http_"+ir.status);
    const ab=await ir.arrayBuffer();
    if(ab.byteLength<10000 || ab.byteLength>MAX_IMAGE_BYTES)throw new Error("image_invalid_size");
    await fs.writeFile(image,Buffer.from(ab));
    for(let i=0;i<3;i++)await fs.writeFile(cards[i],wrapForShort(scenes[i]),"utf8");
    const timeWindows=[[3,11],[11,19],[19,duration-1]];
    const graph=[
      "scale=1080:1920:force_original_aspect_ratio=increase",
      "crop=1080:1920",
      "zoompan=z='min(zoom+0.00014,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:fps=15:s=1080x1920",
      "format=yuv420p"
    ];
    for(let i=0;i<3;i++){
      const [start,end]=timeWindows[i];
      const show="between(t\\,"+start+"\\,"+end+")";
      graph.push("drawbox=x=36:y=1235:w=1008:h=560:color=0x06192E@0.92:t=fill:enable='"+show+"'");
      graph.push("drawbox=x=62:y=1265:w=180:h=9:color=0xFFC400@1:t=fill:enable='"+show+"'");
      graph.push("drawtext=fontfile="+font+":textfile="+cards[i]+":reload=0:fontsize=52:fontcolor=white:line_spacing=19:x=92:y=1360:enable='"+show+"'");
    }
    graph.push("fade=t=in:st=0:d=0.4");
    graph.push("fade=t=out:st="+(duration-0.6)+":d=0.6");
    const args=[
      "-hide_banner","-loglevel","error","-y",
      "-loop","1","-framerate","15","-i",image,
      "-f","lavfi","-i","aevalsrc="+audioExpr(style)+":s=44100:d="+duration,
      "-vf",graph.join(","),
      "-r","15","-t",String(duration),
      "-c:v","libx264","-preset","ultrafast","-crf","28",
      "-profile:v","main","-level","4.0","-pix_fmt","yuv420p",
      "-c:a","aac","-b:a","80k",
      "-movflags","+faststart","-shortest",output
    ];
    await execFfmpeg(args,175000);
    const result=await fs.readFile(output);
    if(result.length<12000 || result.length>35*1024*1024)throw new Error("short_file_size_invalid");
    return result;
  }finally{
    await Promise.allSettled([fs.unlink(image),fs.unlink(output),...cards.map(p=>fs.unlink(p))]);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true, service: "giro-reels-worker", ffmpeg: true, shorts_renderer: "v1" });
    }
    if (req.method !== "POST" || (req.url !== "/render" && req.url !== "/render-short")) {
      return sendJson(res, 404, { ok: false, error: "not_found" });
    }
    if (!WORKER_KEY || req.headers["x-giro-worker-key"] !== WORKER_KEY) {
      return sendJson(res, 401, { ok: false, error: "unauthorized" });
    }
    const body = await readJson(req);
    const video = req.url === "/render-short" ? await renderShortVideo(body) : await renderVideo(body);
    res.writeHead(200, {
      "content-type": "video/mp4",
      "content-length": video.length,
      "cache-control": "no-store"
    });
    res.end(video);
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("giro-reels-worker listening on", PORT);
});
