#!/usr/bin/env python3
"""Renderizador QA de Reels do Giro Madeira no GitHub Actions.
Usa somente imagem editorial oficial, narração local e FFmpeg; não publica.
"""
from __future__ import annotations
import json, os, re, subprocess, sys, tempfile
from pathlib import Path
import requests

ROOT="https://dsihvbdhocbqscaypraw.supabase.co"
BRIDGE=ROOT+"/functions/v1/giro-reels-github-render-bridge"
UA="GiroMadeira-Internal-ReelsQA/1.0"
HEADERS={"User-Agent":UA}
def run(cmd,timeout=240,cwd=None):
    p=subprocess.run(cmd,text=True,capture_output=True,timeout=timeout,cwd=cwd)
    if p.returncode:
        raise RuntimeError("command_failed "+str(cmd[0])+": "+p.stderr[-1200:])
    return p.stdout.strip()

def token():
    endpoint=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    credential=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not endpoint or not credential:raise RuntimeError("github_oidc_missing")
    result=requests.get(endpoint,params={"audience":BRIDGE},
        headers={"Authorization":"Bearer "+credential},timeout=20)
    result.raise_for_status()
    return result.json()["value"]

def claim(tok,requested=0):
    params={"action":"claim"}
    if requested:params["publication_id"]=requested
    resp=requests.post(BRIDGE,params=params,
         headers={"Authorization":"Bearer "+tok},timeout=35)
    if resp.status_code >= 400:
        raise RuntimeError("qa_bridge_claim_http_"+str(resp.status_code)+": "+resp.text[:1500])
    data=resp.json()
    if not data.get("success"):raise RuntimeError("claim: "+str(data))
    return data

def safe_text(value):
    text=re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",str(value or ""))).strip()
    return text.replace("&nbsp;"," ").replace("&amp;","&")

def narration(item):
    title=safe_text(item.get("title"))
    # Narrate facts already present in source summary, never improvise details.
    summary=safe_text(item.get("summary"))
    summary=re.sub(r"^"+re.escape(title)+r"[.\s]*","",summary,flags=re.I)
    if len(summary)>300:
        i=summary[:300].rfind(". ")
        summary=summary[:i+1] if i>=100 else summary[:260].rsplit(" ",1)[0]+"."
    script=(title+". "+summary).strip()
    if len(script)<35:raise RuntimeError("editorial_narration_too_short")
    return script[:490]

def seconds(media):
    data=json.loads(run(["ffprobe","-v","error","-show_entries","format=duration",
      "-of","json",str(media)],timeout=15))
    return float(data["format"]["duration"])

def captions(text,voice_dur,file):
    # Timed subtitle groups, aligned to total synthesized narration duration.
    words=text.split()
    chunks=[" ".join(words[i:i+6]) for i in range(0,len(words),6)]
    weights=[max(2,len(x)) for x in chunks]; total=sum(weights)
    elapsed=0
    def ts(t):
        ms=int(t*1000)
        return f"{ms//3600000:02}:{(ms//60000)%60:02}:{(ms//1000)%60:02},{ms%1000:03}"
    with open(file,"w",encoding="utf-8") as o:
        for i,(chunk,weight) in enumerate(zip(chunks,weights),1):
            end=min(voice_dur,elapsed+voice_dur*weight/total)
            o.write(f"{i}\n{ts(elapsed)} --> {ts(end)}\n{chunk}\n\n")
            elapsed=end

def verify(path):
    data=json.loads(run(["ffprobe","-v","error","-show_streams","-show_format",
        "-of","json",str(path)],timeout=15))
    video=next((s for s in data["streams"] if s["codec_type"]=="video"),None)
    audio=next((s for s in data["streams"] if s["codec_type"]=="audio"),None)
    if not video or not audio:raise RuntimeError("missing_video_or_audio")
    fraction=video.get("avg_frame_rate","0/1").split("/")
    fps=float(fraction[0])/float(fraction[1])
    duration=float(data["format"]["duration"])
    w,h=int(video.get("width",0)),int(video.get("height",0))
    vc,ac=video.get("codec_name"),audio.get("codec_name")
    if (w,h)!=(1080,1920) or not 29.5<=fps<=30.5 or vc!="h264" or ac!="aac" or not 7<=duration<=75:
        raise RuntimeError("invalid_video_specs "+str((w,h,fps,duration,vc,ac)))
    return {"x-giro-width":str(w),"x-giro-height":str(h),
      "x-giro-fps":f"{fps:.2f}","x-giro-duration":f"{duration:.2f}",
      "x-giro-vcodec":vc,"x-giro-acodec":ac}

def render(item,dirpath):
    cwd=Path(dirpath)
    image_url=item["image_url"]
    if not image_url.startswith(ROOT+"/storage/v1/object/public/news-images/"):
        raise RuntimeError("untrusted_image_origin")
    response=requests.get(image_url,headers=HEADERS,timeout=28)
    response.raise_for_status()
    if len(response.content)>10_000_000 or len(response.content)<8_000:
        raise RuntimeError("image_invalid_size")
    (cwd/"story.jpg").write_bytes(response.content)
    text=narration(item)
    run(["espeak-ng","-v","pt-br","-s","161","-p","45","-w","narration.wav",text],timeout=90,cwd=cwd)
    voice=seconds(cwd/"narration.wav")
    duration=round(max(9,min(voice+1.3,70)),1)
    captions(text,voice,cwd/"subtitle.srt")
    # Controlled editorial Ken Burns motion, smooth fade transitions and soft audio bed.
    vf=("scale=1200:2134:force_original_aspect_ratio=increase,"
        "crop=1080:1920:x='(iw-ow)/2+(iw-ow)/2*sin(n/115)':"
        "y='(ih-oh)/2+(ih-oh)/2*cos(n/135)',"
        "eq=contrast=1.02,"
        "fade=t=in:st=0:d=0.65,"
        f"fade=t=out:st={max(0,duration-0.65):.2f}:d=0.65,"
        "subtitles=subtitle.srt:force_style='FontName=DejaVu Sans,FontSize=25,"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00101620,"
        "BorderStyle=3,BackColour=&H770B172C,Outline=2,MarginV=200,Alignment=2',"
        "format=yuv420p")
    cmd=["ffmpeg","-hide_banner","-loglevel","error","-y","-filter_threads","2",
       "-loop","1","-framerate","30","-i","story.jpg",
       "-i","narration.wav","-f","lavfi","-i","sine=frequency=92:sample_rate=44100",
       "-filter_complex",f"[0:v]{vf}[v];[1:a]volume=1.0[voice];[2:a]volume=0.025[bed];[voice][bed]amix=inputs=2:duration=longest[a]",
       "-map","[v]","-map","[a]","-t",str(duration),"-r","30",
       "-c:v","libx264","-preset","veryfast","-crf","27","-threads","2",
       "-pix_fmt","yuv420p","-c:a","aac","-b:a","112k",
       "-movflags","+faststart","render.mp4"]
    run(cmd,timeout=1100,cwd=cwd)
    return cwd/"render.mp4"

def main():
    tok=token()
    requested=int(os.environ.get("GIRO_TEST_REEL_ID","0") or "0")
    data=claim(tok,requested)
    if not data.get("available"):
        print("NO_ELIGIBLE_REEL "+str(data.get("reason")))
        return
    ident=data["publication_id"]
    with tempfile.TemporaryDirectory(prefix="giro-reel-") as tmp:
        try:
            path=render(data,tmp)
            headers=verify(path)
            payload=path.read_bytes()
            if len(payload)>35_000_000:raise RuntimeError("video_exceeds_35MB")
            headers.update({"Authorization":"Bearer "+tok,"Content-Type":"video/mp4"})
            sent=requests.post(BRIDGE,
              params={"action":"upload","publication_id":ident},
              headers=headers,data=payload,timeout=120)
            sent.raise_for_status()
            result=sent.json()
            if not result.get("success"):raise RuntimeError("upload_rejected: "+str(result))
            print("QA_RENDER_COMPLETE "+json.dumps(result,ensure_ascii=False))
        except Exception:
            print("QA_RENDER_FAILED_FOR_ID "+str(ident))
            raise
if __name__=="__main__":
    main()
