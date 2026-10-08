#!/usr/bin/env python3
"""Giro Madeira Shorts: zero-paid-API, Wikimedia-licensed illustrative visuals.
Runs only on GitHub Actions via OIDC. Failure means NO YouTube publication.
Never uses unlicensed news-site photography or a secret from this repository.
"""
import html, io, json, math, os, random, re, subprocess, sys, tempfile, time, urllib.parse, wave
from pathlib import Path
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

SUPABASE="https://dsihvbdhocbqscaypraw.supabase.co"
BRIDGE=SUPABASE+"/functions/v1/giro-shorts-github-bridge"
AUD=BRIDGE
ROOT=Path(__file__).resolve().parents[1]
HEADERS={"User-Agent":"GiroMadeiraShorts/1.0 (editorial illustration; github.com/giromadeira-spec/giro-madeira-site)"}
W,H=1080,1920
NAVY=(4,17,40); YELLOW=(255,212,0); WHITE=(250,250,254)

def github_token():
    url=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    tok=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not url or not tok: raise RuntimeError("GitHub OIDC unavailable")
    sep="&" if "?" in url else "?"
    r=requests.get(url+sep+"audience="+urllib.parse.quote(AUD,safe=""),headers={"Authorization":"Bearer "+tok},timeout=16)
    r.raise_for_status()
    value=r.json().get("value")
    if not value:raise RuntimeError("Missing OIDC result")
    return value

def bridge(token,action,**kwargs):
    r=requests.post(BRIDGE,json={"action":action,**kwargs},
       headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"},timeout=35)
    body=r.json()
    if r.status_code>=400 or body.get("success") is not True:
       raise RuntimeError("Supabase bridge rejected "+action+": "+str(body.get("error","unknown")))
    return body

def clean(s):
    return re.sub(r"\s+"," ",str(s or "")).strip()

def article_subject(title):
    t=title.lower()
    mapping=[
     (r"mosquito|dengue|aedes|zika|sa[uú]de|vacina|hospital","mosquito aedes aegypti macro","SAÚDE"),
     (r"gasolina|combust[ií]vel|petr[oó]leo|petrobras|posto","gas station petrol pump","ECONOMIA"),
     (r"clima|temporal|chuva|enchente|calor|seca|granizo","storm clouds","CLIMA"),
     (r"pol[ií]cia|pf |prendeu|pris[aã]o|feminic[ií]dio|investiga","police car emergency lights","SEGURANÇA"),
     (r"elei[cç][aã]o|voto|urna|tse|tre-|stf|supremo|congresso|senado|deputad|bolsonaro|lula","brazil electronic voting machine","POLÍTICA"),
     (r"futebol|sele[cç][aã]o|atleta|jogo|copa|fifa|gol ","soccer ball field","ESPORTES"),
     (r"economia|infla[cç][aã]o|d[oó]lar|real|bolsa|banco|juros","financial city skyscrapers","ECONOMIA"),
     (r"tecnologia|intelig[eê]ncia artificial|internet|chip|rob[oô]","computer circuit board macro","TECNOLOGIA"),
     (r"bombardeio|r[uú]ssia|ucr[aâ]nia|guerra|ataque|internacional|mundo|eua|trump|china","world globe earth","MUNDO")
    ]
    for rx,query,category in mapping:
       if re.search(rx,t):return query,category
    return "newspaper printing press", "NOTÍCIAS"

def licensed_commons_photo(topic):
    # Wikimedia Commons is not a blanket license: verify each file's metadata.
    url="https://commons.wikimedia.org/w/api.php"
    for term in [topic, topic.split(" ")[0]+" photography"]:
        params={"action":"query","generator":"search","gsrsearch":term,
         "gsrnamespace":"6","gsrlimit":"25","prop":"imageinfo",
         "iiprop":"url|size|extmetadata","iiurlwidth":"1300",
         "format":"json","formatversion":"2"}
        response=requests.get(url,params=params,headers=HEADERS,timeout=22)
        response.raise_for_status()
        pages=response.json().get("query",{}).get("pages",[])
        for page in pages:
            info=(page.get("imageinfo") or [None])[0]
            if not info:continue
            license_name=html.unescape(str(info.get("extmetadata",{}).get("LicenseShortName",{}).get("value","")))
            name=license_name.upper().strip()
            if not (re.search(r"\bCC0\b|PUBLIC DOMAIN|DOMÍNIO PÚBLICO",name)
              or re.fullmatch(r"CC[\s-]*BY[\s-]*(?:2\.0|2\.5|3\.0|4\.0)",name)):
                continue
            if not (int(info.get("width",0))>=1000 and int(info.get("height",0))>=700):continue
            file_url=str(info.get("thumburl") or info.get("url") or "")
            parsed=urllib.parse.urlparse(file_url)
            if parsed.scheme!="https" or parsed.hostname not in ["upload.wikimedia.org","commons.wikimedia.org"]:continue
            if not re.search(r"\.(?:jpe?g|png|webp)(?:/|$|\?)",file_url,re.I):continue
            creator=html.unescape(re.sub("<[^>]+>"," ",str(info.get("extmetadata",{}).get("Artist",{}).get("value",""))))
            creator=clean(creator)[:70] or "autor informado na página do arquivo"
            title=str(page.get("title","")).replace("File:","")
            return file_url, f"wikimedia_{title} — {creator} — {license_name}",title
    raise RuntimeError("No reliably licensed photograph; abort instead of using publisher media")

def photo_matches_topic(topic, title):
    """Fail closed: metadata must explicitly identify the *illustrative subject*."""
    title=clean(title).lower()
    groups={
      "world globe earth":r"\b(globe|globes|planet earth|earth globe|world globe)\b",
      "brazil electronic voting machine":r"\b(voting machine|ballot box|electronic voting|urna eletr[oô]nica)\b",
      "gas station petrol pump":r"\b(gas station|petrol pump|fuel pump|gas pump|gasoline pump)\b",
      "mosquito aedes aegypti macro":r"\b(mosquito|aedes aegypti)\b",
      "storm clouds":r"\b(storm clouds?|stormy sky|thunderstorm|lightning|rain clouds?|cumulonimbus)\b",
      "police car emergency lights":r"\b(police car|police vehicle|police lights|police cruiser)\b",
      "soccer ball field":r"\b(soccer ball|football ball|soccer field|football field)\b",
      "financial city skyscrapers":r"\b(skyscraper|financial district|financial center|financial centre)\b",
      "computer circuit board macro":r"\b(circuit board|printed circuit|motherboard)\b",
      "newspaper printing press":r"\b(printing press|newspaper printing|newspaper press)\b"
    }
    pattern=groups.get(topic)
    return bool(pattern and re.search(pattern,title,re.I))

def licensed_openverse_photo(topic):
    """Search open-licensed photos, never scraping websites or selecting stock with unknown rights."""
    endpoint="https://api.openverse.org/v1/images/"
    qparams={"q":topic,"license":"cc0,by","category":"photograph",
              "page_size":20}
    r=requests.get(endpoint,params=qparams,headers=HEADERS,timeout=24)
    r.raise_for_status()
    for obj in r.json().get("results",[]):
       license_name=str(obj.get("license") or "").lower().strip()
       license_version=str(obj.get("license_version") or "").strip()
       if license_name not in ("cc0","by") or obj.get("mature") is True:continue
       if obj.get("width") and int(obj["width"])<1000:continue
       if obj.get("height") and int(obj["height"])<700:continue
       creator=clean(obj.get("creator") or "")
       if license_name=="by" and not creator:continue
       img_url=str(obj.get("url") or "")
       parsed=urllib.parse.urlsplit(img_url)
       host=(parsed.hostname or "").lower()
       allowed=(host.endswith(".staticflickr.com") or host=="staticflickr.com"
           or host=="cdn.stocksnap.io")
       if parsed.scheme!="https" or not allowed:continue
       if not re.search(r"\.(?:jpe?g|png|webp)$",parsed.path,re.I):continue
       title=clean(obj.get("title") or "foto ilustrativa")[:60]
       if not photo_matches_topic(topic,title):continue
       try:
          img=fetch_picture(img_url)
       except Exception:
          continue
       landing=str(obj.get("foreign_landing_url") or "")
       if not landing.startswith("https://"):continue
       license_url=str(obj.get("license_url") or "")
       if not license_url.startswith("https://creativecommons.org/"):continue
       credit=("openverse_"+title+" — "+creator[:45]+" — "+
            license_name.upper()+" "+license_version+" — "+
            landing)[:445]
       return img,credit,title
    raise RuntimeError("No downloadable, verified CC0/CC-BY illustration found in Openverse")

def cover(im,w,h,x=.5,y=.5):
    ratio=max(w/im.width,h/im.height)
    nw,nh=round(im.width*ratio),round(im.height*ratio)
    im=im.resize((nw,nh),Image.Resampling.LANCZOS)
    return im.crop((max(0,min(nw-w,round((nw-w)*x))),max(0,min(nh-h,round((nh-h)*y))),
                   max(0,min(nw-w,round((nw-w)*x)))+w,max(0,min(nh-h,round((nh-h)*y)))+h))

def fetch_picture(url):
    r=requests.get(url,headers=HEADERS,timeout=30)
    r.raise_for_status()
    if len(r.content)<12000 or len(r.content)>18*1024*1024:raise ValueError("Invalid picture size")
    img=Image.open(io.BytesIO(r.content));img.load()
    if img.width<900 or img.height<650:raise ValueError("Image too small")
    return img.convert("RGB")

def fonts():
    heavy="/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"
    regular="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    if not (Path(heavy).exists() and Path(regular).exists()):raise RuntimeError("Required free font missing")
    return heavy,regular

def lines_for(draw,message,size,maxwidth,maxlines=4):
    words=clean(message).upper().split()
    fontfile,_=fonts()
    for fs in range(size,51,-3):
        f=ImageFont.truetype(fontfile,fs)
        rows=[];line=""
        for word in words:
            trial=(line+" "+word).strip()
            if draw.textbbox((0,0),trial,font=f)[2]>maxwidth and line:
                rows.append(line);line=word
            else:line=trial
        if line:rows.append(line)
        if len(rows)<=maxlines and all(draw.textbbox((0,0),r,font=f)[2]<=maxwidth for r in rows):
            return rows,f
    raise RuntimeError("Headline cannot fit cinematic layout")

def make_frame(photo,river,logo,claim,scene,idx,credit,path):
    img=cover(photo,W,H, x=[.3,.5,.7][idx],y=.47).convert("RGBA")
    # Topical PHOTO dominates upper half, dark editorial lower third.
    overlay=Image.new("RGBA",(W,H),(0,0,0,0));o=overlay.load()
    for y in range(H):
        a=75 if y<500 else min(245,max(60,round((y-550)*.36)))
        for x in range(W):o[x,y]=(2,12,33,a)
    img=Image.alpha_composite(img,overlay)
    d=ImageDraw.Draw(img)
    # Trademark, high-contrast brand rather than a fake redraw.
    d.rounded_rectangle((34,31,1048,220),radius=20,fill=(3,17,43,230),outline=YELLOW,width=3)
    lb=logo.convert("RGBA")
    lb.thumbnail((173,169),Image.Resampling.LANCZOS)
    img.alpha_composite(lb,(70+(173-lb.width)//2,39+(169-lb.height)//2))
    d=ImageDraw.Draw(img)
    heavy,regular=fonts()
    d.text((267,41),"GIRO",font=ImageFont.truetype(heavy,89),fill=WHITE,stroke_width=2,stroke_fill=(0,0,0))
    d.text((271,133),"MADEIRA",font=ImageFont.truetype(heavy,60),fill=YELLOW,stroke_width=2,stroke_fill=(0,0,0))
    heavy,regular=fonts()
    tagfont=ImageFont.truetype(heavy,40)
    d=ImageDraw.Draw(img)
    d.rounded_rectangle((52,595,490,665),radius=8,fill=(255,212,0,255))
    d.text((76,606),("BRASIL" if claim["topic_scope"]=="brasil" else "MUNDO" if claim["topic_scope"]=="mundo" else "RONDÔNIA")+"  |  "+str(idx+1)+"/3",font=tagfont,fill=NAVY)
    d.rounded_rectangle((50,700,1030,1690),radius=18,fill=(4,21,47,235),outline=(255,212,0,255),width=3)
    d.rectangle((75,739,95,826),fill=YELLOW)
    d.text((125,750),("DESTAQUE • "+article_subject(claim["title"])[1]),font=ImageFont.truetype(heavy,36),fill=YELLOW)
    # Single sensational but true title: use approved article title for first, facts for remaining.
    head=claim["title"] if idx==0 else scene
    rows,tf=lines_for(d,head,102,900,maxlines=5)
    top=868
    for k,line in enumerate(rows):
        d.text((83,top+k*(tf.size+11)),line,font=tf,fill=YELLOW if k==1 else WHITE,
               stroke_width=2,stroke_fill=(0,8,25))
    d.line((83,1422,999,1422),fill=YELLOW,width=5)
    # Short factual slide: never invent or synthesize information.
    fact=scene if idx==0 else "IMAGEM ILUSTRATIVA • FONTE IDENTIFICADA NA DESCRIÇÃO"
    shortfont=ImageFont.truetype(regular,31)
    shortlines=[];current=""
    for word in clean(fact).split():
        trial=(current+" "+word).strip()
        if d.textbbox((0,0),trial,font=shortfont)[2]>892 and current:shortlines.append(current);current=word
        else:current=trial
    if current:shortlines.append(current)
    if len(shortlines)>4:raise RuntimeError("Verified fact text does not fit")
    for j,line in enumerate(shortlines):d.text((83,1457+j*41),line,font=shortfont,fill=WHITE)
    d.rounded_rectangle((73,1640,1009,1699),radius=9,fill=(255,212,0,255))
    d.text((92,1650),"GIRO MADEIRA • NOTÍCIA VERIFICADA",font=ImageFont.truetype(heavy,30),fill=NAVY)
    # Rio Madeira is always visible as regional brand, not the scene of the event.
    rio=cover(river,W,215).convert("RGBA")
    rio.putalpha(220)
    img.alpha_composite(rio,(0,1704))
    d=ImageDraw.Draw(img)
    d.rectangle((0,1703,1080,1711),fill=YELLOW)
    d.rounded_rectangle((34,1730,500,1802),radius=10,fill=(2,18,43,230))
    d.text((52,1744),"RIO MADEIRA • RONDÔNIA",font=ImageFont.truetype(heavy,35),fill=WHITE)
    d.rectangle((0,1873,1080,1920),fill=(1,14,33,255))
    txt=("IMAGEM ILUSTRATIVA • "+str(claim.get("source_name") or "FONTE")+f" • {idx+1}/3").upper()
    d.text((28,1882),txt[:78],font=ImageFont.truetype(regular,25),fill=WHITE)
    img.convert("RGB").save(path,format="PNG",optimize=True)

def river_from_archived_short(url,folder):
    local=folder/"river-reference.mp4"
    response=requests.get(url,headers=HEADERS,timeout=30)
    response.raise_for_status()
    if not 50000<len(response.content)<15000000:raise RuntimeError("River asset not available")
    local.write_bytes(response.content)
    frame=folder/"frame.png"
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-ss","1.5","-i",str(local),
         "-frames:v","1",str(frame)],check=True,timeout=40)
    image=Image.open(frame).convert("RGB")
    if image.size!=(1080,1920):raise RuntimeError("Unexpected provenance footage")
    return image.crop((0,1710,1080,1850))

def make_music(out,duration):
    # Original, synthetic low-key underscore, never a copyrighted music sample.
    sample=24000
    with wave.open(str(out),"wb") as f:
      f.setnchannels(1);f.setsampwidth(2);f.setframerate(sample)
      for chunk_start in range(0,int(duration*sample),sample):
        buf=bytearray()
        for i in range(chunk_start,min((chunk_start+sample),int(duration*sample))):
            t=i/sample
            swell=min(1,t/2,(duration-t)/2)
            wavevalue=(math.sin(t*2*math.pi*110)*.10+
             math.sin(t*2*math.pi*164.81)*.06+
             math.sin(t*2*math.pi*220)*.03)*max(.0,swell)
            buf.extend(int(max(-1,min(1,wavevalue))*28000).to_bytes(2,"little",signed=True))
        f.writeframes(buf)

def render_frames(frames,out,music):
    concat=[]
    for idx,frame in enumerate(frames):
        segment=out.parent/("scene"+str(idx)+".mp4")
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-loop","1","-framerate","15","-i",str(frame),
         "-t","9","-vf","fade=t=in:st=0:d=0.3,fade=t=out:st=8.65:d=0.35",
         "-r","15","-c:v","libx264","-preset","veryfast","-crf","26","-pix_fmt","yuv420p","-an",str(segment)],
         check=True,timeout=130)
        concat.append(segment)
    listing=out.parent/"frames.txt"
    listing.write_text("".join("file '"+p.name+"'\n" for p in concat),encoding="utf-8")
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",str(listing),
       "-i",str(music),"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","64k",
       "-movflags","+faststart","-t","27",str(out)],check=True,timeout=60)
    if not (100000<out.stat().st_size<30*1024*1024):raise RuntimeError("Output out of bounds")
    # Validate actual encode parameters, not only extension.
    proc=subprocess.run(["ffprobe","-v","error","-select_streams","v:0","-show_entries",
        "stream=width,height,codec_name","-of","json",str(out)],capture_output=True,text=True,check=True)
    stream=json.loads(proc.stdout)["streams"][0]
    if stream.get("codec_name")!="h264" or stream["width"]!=1080 or stream["height"]!=1920:
        raise RuntimeError("Output video dimensions or codec invalid")

def main():
    token=github_token()
    # Dry-run on push: never spend API upload quota or claim rows.
    if os.environ.get("GITHUB_EVENT_NAME")=="push":
        result=bridge(token,"status")
        print("Security handshake:",result.get("mode"),"Rendering enabled:",result.get("renderer_enabled"))
        if os.environ.get("GIRO_PUSH_TEST_RENDER") != "1": return
        print("One-time render-only validation; public uploads stay disabled")
    result=bridge(token,"claim")
    if not result.get("processed"):
        print("Nothing eligible:",result.get("reason","no candidate"))
        return
    qid=result["queue_id"]
    try:
      with tempfile.TemporaryDirectory(prefix="giro-shorts-") as tmp:
        folder=Path(tmp)
        query,category=article_subject(result["title"])
        picture,credit,file_title=licensed_openverse_photo(query)
        logo=Image.open(ROOT/"assets/logo-oficial.webp").convert("RGB")
        river=river_from_archived_short(result["river_sample_video_url"],folder)
        frames=[]
        for i,scene in enumerate(result["scenes"]):
            file=folder/("card%d.png"%i)
            make_frame(picture,river,logo,result,scene,i,credit,file)
            frames.append(file)
        soundtrack=folder/"sound.wav";make_music(soundtrack,27)
        video=folder/"giro_short.mp4";render_frames(frames,video,soundtrack)
        preview_dir=ROOT/"shorts-test-preview"
        preview_dir.mkdir(exist_ok=True)
        frames[0].replace(preview_dir/("fila-"+str(qid)+".png"))
        with video.open("rb") as f:
            response=requests.put(result["upload_url"],data=f,headers={"Content-Type":"video/mp4","x-upsert":"false"},
              timeout=130)
        if response.status_code not in (200,201):
            raise RuntimeError("Supabase signed upload failed with HTTP "+str(response.status_code))
        confirmed=bridge(token,"complete",queue_id=qid,storage_path=result["storage_path"],
                 quality_passed=True,image_credit=credit)
        print("Rendered and stored approved video for queue",confirmed["queue_id"])
        print("Openverse-licensed illustration:",file_title)
    except Exception as e:
        try: bridge(token,"fail",queue_id=qid)
        except Exception: print("Could not update queue error status.")
        raise RuntimeError("Render failed safely without publishing: "+str(e)[:150]) from e

if __name__=="__main__":
    main()
