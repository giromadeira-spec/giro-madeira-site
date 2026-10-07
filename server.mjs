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

    const frames = Math.round(secs * 30);
    const vf = [
      "scale=1200:2134:force_original_aspect_ratio=increase",
      "crop=1200:2134",
      "zoompan=z='min(zoom+0.00045,1.075)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=" + frames + ":s=1080x1920:fps=30",
      "format=yuv420p"
    ].join(",");

    const args = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-loop", "1", "-i", input,
      "-f", "lavfi", "-i", "aevalsrc=" + audioExpr(style) + ":s=44100:d=" + secs,
      "-vf", vf,
      "-t", String(secs),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
      "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k",
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true, service: "giro-reels-worker", ffmpeg: true });
    }
    if (req.method !== "POST" || req.url !== "/render") {
      return sendJson(res, 404, { ok: false, error: "not_found" });
    }
    if (!WORKER_KEY || req.headers["x-giro-worker-key"] !== WORKER_KEY) {
      return sendJson(res, 401, { ok: false, error: "unauthorized" });
    }
    const body = await readJson(req);
    const video = await renderVideo(body);
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
