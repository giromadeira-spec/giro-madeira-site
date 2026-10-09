#!/usr/bin/env python3
"""Giro Madeira TikTok-only 30 FPS copy. Original YouTube Shorts remain untouched.
Only GitHub Actions OIDC may claim/upload. No GitHub secret or personal Buffer key required.
"""
import io,json,os,subprocess,tempfile,urllib.parse
from pathlib import Path
from fractions import Fraction
import requests
from PIL import Image, ImageStat

BRIDGE="https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/giro-tiktok-30fps-bridge"
MAX_BYTES=30*1024*1024

def oidc():
    url=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    token=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not url or not token:
        raise RuntimeError("GitHub OIDC not available; refusing to convert")
    sep="&" if "?" in url else "?"
    r=requests.get(url+sep+"audience="+urllib.parse.quote(BRIDGE,safe=""),
        headers={"Authorization":"Bearer "+token},timeout=20)
    r.raise_for_status()
    v=r.json().get("value")
    if not v:raise RuntimeError("Empty Github OIDC")
    return v

def bridge(token,action,**kwargs):
    r=requests.post(BRIDGE,json={"action":action,**kwargs},
        headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        timeout=35)
    body=r.json()
    if r.status_code>=400 or not body.get("success"):
        raise RuntimeError("TikTok video bridge rejected "+action+": "+str(body.get("error","unknown")))
    return body

def ffprobe(p):
    r=subprocess.run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(p)],
        check=True,capture_output=True,text=True,timeout=35)
    meta=json.loads(r.stdout)
    videos=[v for v in meta.get("streams",[]) if v.get("codec_type")=="video"]
    if len(videos)<1:raise RuntimeError("No video stream")
    stream=videos[0]
    rate=stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0/1"
    fps=float(Fraction(rate))
    seconds=float(meta.get("format",{}).get("duration") or stream.get("duration") or 0)
    if not (fps>0 and 5<=seconds<=180):raise RuntimeError("Unsupported source FPS/duration")
    return {"fps":fps,"seconds":seconds,"width":int(stream.get("width") or 0),
       "height":int(stream.get("height") or 0),"codec":stream.get("codec_name"),
       "pix_fmt":stream.get("pix_fmt")}

def download_video(url,path):
    parsed=urllib.parse.urlparse(url)
    if parsed.scheme!="https" or parsed.netloc!="dsihvbdhocbqscaypraw.supabase.co" \
       or not parsed.path.startswith("/storage/v1/object/public/news-videos/shorts/") \
       or not parsed.path.endswith(".mp4"):
        raise RuntimeError("Refusing unexpected video download host")
    with requests.get(url,stream=True,timeout=(15,75)) as r:
        r.raise_for_status()
        total=0
        with path.open("wb") as fh:
            for chunk in r.iter_content(chunk_size=1024*256):
                if not chunk:continue
                total+=len(chunk)
                if total>MAX_BYTES:raise RuntimeError("Input MP4 too large")
                fh.write(chunk)
    if total<100000:raise RuntimeError("Source video too small")

def validate_frames(video,seconds,work):
    # Simple visual sanity check, not a substitute for editorial approval.
    details=[]
    for idx,at in enumerate([min(3.0,seconds*.15),min(10.0,seconds*.45)]):
        shot=work/("check_"+str(idx)+".jpg")
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-ss",str(at),"-i",
            str(video),"-frames:v","1","-vf","scale=180:-2",str(shot)],
            check=True,timeout=30)
        with Image.open(shot) as im:
            stat=ImageStat.Stat(im.convert("RGB"))
            details.append(max(stat.stddev))
    if max(details,default=0)<6:
        raise RuntimeError("Video appears visually blank")

def main():
    if os.environ.get("GITHUB_ACTIONS")!="true":
        raise RuntimeError("Refusing local run without GitHub workflow")
    token=oidc()
    result=bridge(token,"claim")
    if not result.get("processed"):
        print("TikTok 30fps converter idle:",result.get("reason","no input"))
        return
    source_id=int(result["source_queue_id"])
    with tempfile.TemporaryDirectory(prefix="giro_tiktok_") as tmp:
        work=Path(tmp);input_video=work/"source.mp4";out=work/"tiktok_30fps.mp4"
        try:
            download_video(result["original_video_url"],input_video)
            inp=ffprobe(input_video)
            if inp["width"]<480 or inp["height"]<720 or inp["height"]<=inp["width"]:
                raise RuntimeError("Source aspect ratio unsuitable for vertical TikTok video")
            cmd=["ffmpeg","-hide_banner","-loglevel","error","-y",
              "-i",str(input_video),
              "-map","0:v:0","-map","0:a?",
              "-vf","fps=30","-r","30","-fps_mode","cfr",
              "-c:v","libx264","-preset","veryfast","-crf","24",
              "-pix_fmt","yuv420p","-c:a","aac","-b:a","128k",
              "-ar","44100","-movflags","+faststart",str(out)]
            subprocess.run(cmd,check=True,timeout=260)
            output=ffprobe(out)
            if output["codec"]!="h264" or output["pix_fmt"]!="yuv420p" \
              or not 29.5<=output["fps"]<=30.5 or abs(inp["seconds"]-output["seconds"])>2:
                raise RuntimeError("Video transcode metadata verification failed")
            if out.stat().st_size<100000 or out.stat().st_size>MAX_BYTES:
                raise RuntimeError("Output outside size bounds")
            validate_frames(out,output["seconds"],work)
            with out.open("rb") as fh:
                r=requests.put(result["upload_url"],data=fh,
                    headers={"Content-Type":"video/mp4","x-upsert":"false"},timeout=140)
            if r.status_code not in (200,201):
                raise RuntimeError("Supabase TikTok upload returned HTTP "+str(r.status_code))
            done=bridge(token,"complete",source_queue_id=source_id,storage_path=result["storage_path"],
                input_fps=inp["fps"],output_fps=output["fps"],width=output["width"],
                height=output["height"],seconds=output["seconds"],
                codec=output["codec"],pix_fmt=output["pix_fmt"])
            print(json.dumps({"status":"ready","source_queue_id":source_id,
                "source_fps":inp["fps"],"tiktok_fps":output["fps"],
                "ready":done.get("ready",False)}))
        except Exception as e:
            try:bridge(token,"fail",source_queue_id=source_id)
            except Exception:pass
            raise RuntimeError("Safe TikTok-only video conversion failed: "+str(e)[:180]) from e

if __name__=="__main__":
    main()
