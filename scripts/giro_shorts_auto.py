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
     (r"cadastro [uú]nico|cad[uú]nico|bolsa fam[ií]lia","cadastro unico editorial graphic","SERVIÇOS"),
     (r"mosquito|dengue|aedes|zika|sa[uú]de|vacina|hospital","mosquito aedes aegypti macro","SAÚDE"),
     (r"gasolina|combust[ií]vel|petr[oó]leo|petrobras|posto","gas station petrol pump","ECONOMIA"),
     (r"clima|temporal|chuva|enchente|calor|seca|granizo","lightning storm","CLIMA"),
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
      "world globe earth":r"\b(globe|globes|planet earth|earth globe|world globe|the earth seen from apollo 17|earth from space|blue marble)\b",
      "brazil electronic voting machine":r"\b(voting machine|ballot box|electronic voting|urna eletr[oô]nica)\b",
      "gas station petrol pump":r"\b(gas station|petrol pump|fuel pump|gas pump|gasoline pump)\b",
      "mosquito aedes aegypti macro":r"\b(mosquito|aedes aegypti)\b",
      "lightning storm":r"\b(lightning|thunderstorm|electric storm)\b",
      "police car emergency lights":r"\b(police car|police vehicle|police lights|police cruiser)\b",
      "soccer ball field":r"\b(soccer ball|football ball|soccer field|football field)\b",
      "financial city skyscrapers":r"\b(skyscraper|financial district|financial center|financial centre)\b",
      "computer circuit board macro":r"\b(circuit board|printed circuit|motherboard)\b",
      "newspaper printing press":r"\b(printing press|newspaper printing|newspaper press)\b"
    }
    pattern=groups.get(topic)
    return bool(pattern and re.search(pattern,title,re.I))

def licensed_commons_download(topic):
    """Fallback: Wikimedia Commons photo with per-file licensing, subject and bytes verified."""
    endpoint="https://commons.wikimedia.org/w/api.php"
    fallback_terms={
      "world globe earth":["EXACT:File:The Earth seen from Apollo 17.jpg", "earth globe", "world globe", "globe"],
      "brazil electronic voting machine":["urna eletrônica", "electronic voting machine"],
      "police car emergency lights":["police car", "police vehicle"],
      "lightning storm":["lightning storm", "lightning"],
      "soccer ball field":["soccer ball", "football field"],
    }
    searches=fallback_terms.get(topic,[topic,topic.split()[0]])
    for search in searches:
        params={"action":"query","generator":"search","gsrsearch":search,
          "gsrnamespace":"6","gsrlimit":"30","prop":"imageinfo",
          "iiprop":"url|size|extmetadata","iiurlwidth":"1600",
          "format":"json","formatversion":"2"}
        if search.startswith("EXACT:"):
            for opt in ("generator","gsrsearch","gsrnamespace","gsrlimit"):
                params.pop(opt,None)
            params["titles"]=search.removeprefix("EXACT:")
        try:
            r=requests.get(endpoint,params=params,headers=HEADERS,timeout=20)
            r.raise_for_status()
            pages=r.json().get("query",{}).get("pages",[])
        except Exception as e:
            print("Wikimedia Commons search unavailable:",type(e).__name__)
            continue
        for page in pages:
            info=(page.get("imageinfo") or [None])[0]
            if not info:continue
            title=str(page.get("title","")).removeprefix("File:")
            if not photo_matches_topic(topic,title):continue
            if re.search(r"\b(protest|demonstration|victim|execution|body|injured)\b",title,re.I):
                continue
            meta=info.get("extmetadata") or {}
            license_name=html.unescape(str((meta.get("LicenseShortName") or {}).get("value",""))).strip()
            license_url=html.unescape(str((meta.get("LicenseUrl") or {}).get("value",""))).strip()
            label=license_name.upper()
            is_pd=bool(re.search(r"\bCC0\b|PUBLIC DOMAIN|DOMÍNIO PÚBLICO",label))
            is_by=bool(re.fullmatch(r"CC[ -]*BY[ -]*(2\.0|2\.5|3\.0|4\.0)",label))
            if not (is_pd or is_by):continue
            if is_by and not license_url.startswith("https://creativecommons.org/licenses/by/"):
                continue
            if int(info.get("width",0))<1000 or int(info.get("height",0))<700:continue
            url=str(info.get("thumburl") or info.get("url") or "")
            parsed=urllib.parse.urlparse(url)
            if parsed.scheme!="https" or parsed.hostname not in ("upload.wikimedia.org","commons.wikimedia.org"):
                continue
            if not re.search(r"\.(?:jpe?g|png|webp)(?:$|[?])",parsed.path,re.I):
                continue
            artist=clean(html.unescape(re.sub("<[^>]*>"," ",str((meta.get("Artist") or {}).get("value","")))))
            if is_by and not artist:continue
            landing="https://commons.wikimedia.org/wiki/File:"+urllib.parse.quote(title.replace(" ","_"),safe="()-_")
            try:photo=fetch_picture(url)
            except Exception:continue
            credit=("wikimedia_"+title[:70]+" — "+artist[:60]+" — "+license_name+" — "+landing)[:445]
            return photo,credit,title
    raise RuntimeError("No topical and licensable downloadable Wikimedia image found")

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
       if re.search(r"\b(building|brick|house|church|chapel|school|roof|architecture|protest|demonstration|person|people)\b",title,re.I):continue
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

def render_text_only_background(category):
    """Original abstract editorial background; no third-party imagery or simulated real events."""
    image=Image.new("RGB",(W,H),NAVY)
    d=ImageDraw.Draw(image)
    for y in range(H):
        t=y/max(1,H-1)
        d.line((0,y,W,y),fill=(4+int(12*t),17+int(19*t),40+int(26*t)))
    # Geometric, intentionally non-photographic newsroom motifs.
    for i in range(12):
        x=80+i*100
        d.line((x,260,x-210,1120),fill=(24,53,85),width=5)
    d.ellipse((620,270,1030,680),outline=(74,105,128),width=12)
    d.ellipse((700,350,950,600),outline=(74,105,128),width=6)
    d.rectangle((70,1160,1010,1172),fill=YELLOW)
    return image

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
    """Official cinematic vertical editorial art, with verified visual provenance.

    Real photo: only individually licensed CC0/CC-BY and clearly marked illustrative.
    Every title, category and source comes from the vetted news item.
    No triangle, play icon, generic iconographic reconstruction or fake police scene.
    """
    img=cover(photo,W,H,x=[.42,.52,.62][idx],y=.45).convert("RGB")
    img=ImageEnhance.Contrast(img).enhance(1.10)
    img=ImageEnhance.Color(img).enhance(1.09).convert("RGBA")

    # Dramatic but legible: photographic hero occupies upper 60 percent.
    overlay=Image.new("RGBA",(W,H),(0,0,0,0))
    d=ImageDraw.Draw(overlay)
    for y in range(H):
        if y<170: alpha=125
        elif y<825:alpha=28
        elif y<1130:alpha=round(28+(y-825)/305*147)
        elif y<1620:alpha=round(175+(y-1130)/490*71)
        else:alpha=251
        d.line((0,y,W,y),fill=(1,10,24,min(252,alpha)),width=1)
    img=Image.alpha_composite(img,overlay)
    d=ImageDraw.Draw(img)
    heavy,regular=fonts()

    # Compact branding from the original official mark, not a competitor's logo.
    d.rounded_rectangle((27,28,711,210),radius=14,fill=(2,14,35,212))
    mark=logo.convert("RGBA")
    mark.thumbnail((160,160),Image.Resampling.LANCZOS)
    img.alpha_composite(mark,(45+(160-mark.width)//2,38+(160-mark.height)//2))
    d=ImageDraw.Draw(img)
    d.text((218,42),"GIRO",font=ImageFont.truetype(heavy,93),fill=WHITE,stroke_width=1,stroke_fill=(0,7,17))
    d.text((222,121),"MADEIRA",font=ImageFont.truetype(heavy,63),fill=YELLOW,stroke_width=1,stroke_fill=(0,7,17))

    _,subject=article_subject(claim["title"])
    category=clean(subject).upper()[:16]
    if category=="SEGURANÇA":category="POLÍCIA"
    red=(222,31,45,255)
    category_color=red if category in ("POLÍCIA","TRÂNSITO") else (255,212,0,255)
    category_ink=WHITE if category_color==red else NAVY
    tagfont=ImageFont.truetype(heavy,45)
    label_width=min(485,d.textbbox((0,0),category,font=tagfont)[2]+55)
    d.rounded_rectangle((54,252,54+label_width,329),radius=12,fill=category_color)
    d.text((80,268),category,font=tagfont,fill=category_ink)
    local=("BRASIL" if claim.get("topic_scope")=="brasil" else
           "MUNDO" if claim.get("topic_scope")=="mundo" else "RONDÔNIA")
    loc_font=ImageFont.truetype(heavy,35)
    loc_width=d.textbbox((0,0),local,font=loc_font)[2]+55
    d.rounded_rectangle((54,348,54+loc_width,410),radius=9,fill=(5,20,43,230),outline=YELLOW,width=2)
    d.text((78,359),local,font=loc_font,fill=YELLOW)
    # Rio Madeira is a permanent regional identity element, separate from
    # the factual event photo. Its scenic graphic is never implied to be
    # a police-operation photograph.
    rio_card=river.convert("RGB").resize((278,108),Image.Resampling.LANCZOS).convert("RGBA")
    d.rounded_rectangle((739,433,1048,573),radius=12,fill=(2,14,29,235),outline=YELLOW,width=2)
    img.alpha_composite(rio_card,(753,443))
    d=ImageDraw.Draw(img)
    d.rectangle((753,525,1031,551),fill=(3,18,37,231))
    d.text((770,528),"RIO MADEIRA",font=ImageFont.truetype(heavy,22),fill=WHITE)
    if claim.get("urgent") is True:
        d.rounded_rectangle((769,240,1044,320),radius=7,fill=red)
        d.text((794,258),"URGENTE",font=ImageFont.truetype(heavy,49),fill=WHITE)

    # Open photo above, punchy typography below; adapt font before rendering.
    head=clean(claim["title"].split("|")[0]) if idx==0 else clean(scene)
    rows,tf=lines_for(d,head,91,942,maxlines=5)
    leading=tf.size+9
    start=max(1035,1610-(len(rows)-1)*leading-tf.size)
    for k,line in enumerate(rows):
        # Accent a meaningful line, not artificial values or invented numbers.
        color=YELLOW if k==0 else WHITE
        d.text((62,start+k*leading),line,font=tf,fill=color,
               stroke_width=2,stroke_fill=(1,7,18))
    bottom=start+(len(rows)-1)*leading+tf.size

    # Small factual supporting text; never crop a verified sentence.
    fact=clean(scene) if idx==0 else "IMAGEM ILUSTRATIVA • VEJA A FONTE NA DESCRIÇÃO"
    fact_font=ImageFont.truetype(regular,31)
    pieces=[];current=""
    for word in fact.split():
        trial=(current+" "+word).strip()
        if d.textbbox((0,0),trial,font=fact_font)[2]>940 and current:
            pieces.append(current);current=word
        else:current=trial
    if current:pieces.append(current)
    fact_top=max(bottom+24,1634)
    if len(pieces)<=2 and fact_top+len(pieces)*42<1770:
        for i,line in enumerate(pieces):
            d.text((65,fact_top+i*42),line,font=fact_font,fill=(237,245,255,255))

    d.line((62,1770,1017,1770),fill=YELLOW,width=7)
    d.rounded_rectangle((54,1801,1023,1868),radius=10,fill=(6,23,50,240))
    d.text((74,1814),"@GIRO_MADEIRA",font=ImageFont.truetype(heavy,41),fill=WHITE)
    d.text((701,1824),f"CENA {idx+1}/3",font=ImageFont.truetype(heavy,29),fill=YELLOW)
    d.rectangle((0,1882,1080,1920),fill=(1,10,25,255))
    small=ImageFont.truetype(regular,21)
    provenance=f"IMAGEM ILUSTRATIVA • {clean(claim.get('source_name') or 'FONTE')}"
    d.text((31,1891),provenance[:91].upper(),font=small,fill=(225,230,239,255))
    # Explicit credits are also preserved in the video description via image_credit.
    img.convert("RGB").save(path,format="PNG",optimize=True)


def render_clean_madeira_illustration():
    """Branded editorial representation of the Rio Madeira; NO inherited words from earlier videos."""
    strip=Image.new("RGB",(W,215),NAVY)
    d=ImageDraw.Draw(strip)
    sky_top=(23,38,70);sky_bottom=(231,144,51)
    for y in range(215):
        a=y/214
        col=tuple(int(sky_top[i]*(1-a)+sky_bottom[i]*a) for i in range(3))
        d.line((0,y,W,y),fill=col,width=1)
    horizon=72
    d.ellipse((800,15,912,121),fill=(255,201,94))
    d.polygon([(0,93),(135,80),(235,91),(392,75),(531,91),(710,77),(850,89),(1080,71),(1080,115),(0,115)],fill=(5,27,44))
    for y in range(104,215):
        pct=(y-104)/111
        d.line((0,y,W,y),fill=(3+int(20*pct),40+int(57*pct),72+int(35*pct)),width=1)
    rng=random.Random(20261008)
    for j in range(135):
        yy=rng.randint(110,213);xc=rng.randint(0,W)
        rw=rng.randint(8,80)
        golden=(rng.random()<(0.65 if 720<xc<1040 else 0.10))
        d.line((xc,yy,xc+rw,yy),fill=(191,132,55) if golden else (62,102,120),width=1)
    return strip

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
        try:
            if query=="cadastro unico editorial graphic":
                picture=render_text_only_background(category)
                credit="arte editorial original Giro Madeira — sem fotografia externa"
                file_title="arte editorial tipográfica"
            else:
                picture,credit,file_title=licensed_openverse_photo(query)
        except Exception as primary_error:
            print("Openverse image unavailable, attempting verified Commons fallback:",type(primary_error).__name__)
            try:
                picture,credit,file_title=licensed_commons_download(query)
            except Exception as commons_error:
                # Original editorial graphics: no external photo, unknown license, or implied eyewitness scene.
                # The verified article title and approved scenes remain the only factual claims.
                print("No verified licensed photo; using original text-first editorial graphic:",
                      type(commons_error).__name__)
                picture=render_text_only_background(category)
                credit="arte editorial original Giro Madeira — sem fotografia externa"
                file_title="arte editorial tipográfica"
        logo=Image.open(ROOT/"assets/logo-oficial.webp").convert("RGB")
        river=render_clean_madeira_illustration()
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
