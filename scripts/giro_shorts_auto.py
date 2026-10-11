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
     # Incidentes aéreos: evitar fotos genéricas de polícia ou gráficas de jornal.
     (r"avi[aã]o|aeronave|helic[oó]ptero|aeroporto|acidente a[eé]reo|queda de avi[aã]o","aircraft airplane","SEGURANÇA"),
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
            if parsed.scheme!="https" or parsed.hostname not in ["upload.wikimedia.org","thumb.wikimedia.org"]:continue
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
      "newspaper printing press":r"\b(printing press|newspaper printing|newspaper press)\b",
      "aircraft airplane":r"\b(aircraft|airplane|aeroplane|jetplane|avi[aã]o|aeronave|plane)\b"
    }
    pattern=groups.get(topic)
    if topic=="aircraft airplane" and re.search(r"\b(toy|model|paper plane|simulator|diagram|poster|illustration|drawing|game|cartoon)\b",title,re.I):
      return False
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
      "aircraft airplane":["airplane on runway", "aircraft at airport", "airplane"],
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
            if parsed.scheme!="https" or parsed.hostname not in ("upload.wikimedia.org","thumb.wikimedia.org"):
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

def licensed_local_madeira_photo():
    """Curated regional CC0 city/Rio Madeira photo for illustrated local news.

    Only the original Wikimedia file whose individual CC0 license was checked
    is used. The photo is illustrative, never claimed as the reported event.
    """
    filename="File:Porto Velho, Rondônia, Brasil.jpg"
    endpoint="https://commons.wikimedia.org/w/api.php"
    params={"action":"query","titles":filename,"prop":"imageinfo",
            "iiprop":"url|size|extmetadata","iiurlwidth":"1500",
            "format":"json","formatversion":"2"}
    response=requests.get(endpoint,params=params,headers=HEADERS,timeout=22)
    response.raise_for_status()
    page=(response.json().get("query",{}).get("pages") or [None])[0]
    if not page:raise RuntimeError("Rio Madeira photo missing from Wikimedia Commons")
    info=(page.get("imageinfo") or [None])[0]
    if not info:raise RuntimeError("Rio Madeira image metadata unavailable")
    metadata=info.get("extmetadata") or {}
    license_name=clean((metadata.get("LicenseShortName") or {}).get("value",""))
    license_url=str((metadata.get("LicenseUrl") or {}).get("value",""))
    if license_name.upper()!="CC0" or "creativecommons.org/publicdomain/zero/" not in license_url:
        raise RuntimeError("Wikimedia regional photo license was not verified as CC0")
    url=str(info.get("thumburl") or info.get("url") or "")
    host=urllib.parse.urlsplit(url).hostname
    if host not in ("upload.wikimedia.org","thumb.wikimedia.org"):
        raise RuntimeError("Untrusted Commons image host")
    image=fetch_picture(url)
    creator="Silva Júnior / MTur"
    landing="https://commons.wikimedia.org/wiki/File:Porto_Velho,_Rond%C3%B4nia,_Brasil.jpg"
    return image,"wikimedia_"+creator+" — CC0 — "+landing,"Porto Velho / Rio Madeira (CC0)"


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
    """GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1 — approved photo/headline/Rio layout.

    Visual contract: docs/REFERENCIA_CAPA_OFICIAL.md.
    The licensed event photo is illustrative unless authenticated as the real event.
    Logo is the original brand asset: do not redraw it or print a duplicate wordmark.
    Text/category/location/figures come only from vetted news data.
    """
    img=cover(photo,W,H,x=[.42,.52,.62][idx],y=.45).convert("RGB")
    img=ImageEnhance.Contrast(img).enhance(1.13)
    img=ImageEnhance.Color(img).enhance(1.09).convert("RGBA")

    # Full-bleed photographic news backdrop with a readable navy gradient.
    overlay=Image.new("RGBA",(W,H),(0,0,0,0))
    d=ImageDraw.Draw(overlay)
    for y in range(H):
        if y<330: alpha=90
        elif y<735: alpha=18
        elif y<995: alpha=round(18+(y-735)/260*115)
        elif y<1600: alpha=round(133+(y-995)/605*115)
        else: alpha=248
        d.line((0,y,W,y),fill=(1,10,24,min(248,alpha)),width=1)
    img=Image.alpha_composite(img,overlay)
    heavy,regular=fonts()
    d=ImageDraw.Draw(img)

    # Big original round logo, upper-left, over the photo. NO extra GIRO/MADEIRA.
    mark=logo.convert("RGBA")
    mark.thumbnail((295,295),Image.Resampling.LANCZOS)
    logo_x,logo_y=58,62
    img.alpha_composite(mark,(logo_x+(295-mark.width)//2,logo_y+(295-mark.height)//2))
    d=ImageDraw.Draw(img)

    # Yellow editorial topic flag with clean horizontal rule (screenshot style).
    _,subject=article_subject(claim["title"])
    category=clean(subject).upper()[:22]
    if category=="SEGURANÇA":category="POLÍCIA"
    tagfont=ImageFont.truetype(heavy,48)
    while d.textbbox((0,0),category,font=tagfont)[2]>620 and tagfont.size>30:
        tagfont=ImageFont.truetype(heavy,tagfont.size-2)
    tag_right=min(760,98+d.textbbox((0,0),category,font=tagfont)[2]+58)
    tag_top=864
    d.polygon([(55,tag_top),(tag_right+28,tag_top),(tag_right,tag_top+74),(55,tag_top+74)],fill=YELLOW)
    d.text((85,tag_top+9),category,font=tagfont,fill=NAVY)
    d.line((tag_right+29,tag_top+69,1015,tag_top+69),fill=YELLOW,width=5)
    if claim.get("urgent") is True:
        d.rounded_rectangle((785,45,1034,117),radius=6,fill=(222,31,45,255))
        d.text((800,55),"URGENTE",font=ImageFont.truetype(heavy,43),fill=WHITE)

    # Strong center-lower headline. Fit the whole verified text or fail closed.
    head=clean(claim["title"].split("|")[0]) if idx==0 else clean(scene)
    start=974
    for requested_size in (124,112,101,90,80,70,60):
        rows,tf=lines_for(d,head,requested_size,944,maxlines=5)
        leading=int(tf.size*1.13)
        bottom=start+(len(rows)-1)*leading+tf.size
        if bottom<=1518:break
    else:
        raise RuntimeError("Headline does not fit approved reference safe area")
    for k,line in enumerate(rows):
        color=YELLOW if k==1 or (len(rows)==1 and k==0) else WHITE
        d.text((63,start+k*leading),line,font=tf,fill=color,
               stroke_width=3,stroke_fill=(1,7,18))

    # Brief verified support, no cut-off sentence. Crediting remains in video description.
    if idx==0:
        support=clean(scene)
        support_font=ImageFont.truetype(regular,31)
        if support and d.textbbox((0,0),support,font=support_font)[2]<=950:
            sy=max(bottom+26,1540)
            if sy+42<1632:
                d.line((62,sy-19,1017,sy-19),fill=YELLOW,width=5)
                d.text((63,sy),support,font=support_font,fill=WHITE)

    # Permanent Porto Velho/Rio Madeira visual signature in panoramic bottom strip.
    river_top=1644
    river_band=river.convert("RGB").resize((W,H-river_top),Image.Resampling.LANCZOS).convert("RGBA")
    img.alpha_composite(river_band,(0,river_top))
    river_shade=Image.new("RGBA",(W,H-river_top),(1,11,25,91))
    img.alpha_composite(river_shade,(0,river_top))
    d=ImageDraw.Draw(img)
    d.line((56,river_top,1022,river_top),fill=YELLOW,width=7)
    d.rounded_rectangle((57,river_top+22,299,river_top+70),radius=5,fill=(3,16,36,229))
    d.text((74,river_top+32),"RIO MADEIRA",font=ImageFont.truetype(heavy,25),fill=YELLOW)
    d.text((63,H-80),"@GIRO_MADEIRA",font=ImageFont.truetype(heavy,35),
           fill=WHITE,stroke_width=1,stroke_fill=(0,5,14))

    source=clean(claim.get("source_name") or "FONTE")
    source_label="FONTE: "+source.upper()
    source_font=ImageFont.truetype(regular,25)
    for size in (25,22,19,17):
        source_font=ImageFont.truetype(regular,size)
        if d.textbbox((0,0),source_label,font=source_font)[2]<=495:break
    if d.textbbox((0,0),source_label,font=source_font)[2]>495:
        raise RuntimeError("Source label does not fit approved layout")
    source_width=d.textbbox((0,0),source_label,font=source_font)[2]
    d.text((1010-source_width,H-74),source_label,font=source_font,fill=WHITE,
           stroke_width=1,stroke_fill=(0,5,14))

    # The footer is branding and is never presented as the event's physical location.
    # There is intentionally no play triangle, 'scene x/3', invented arrow or logo wordmark.
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

def render_self_test():
    """Offline QA: no OIDC, no Supabase, no YouTube and no network requests.

    Produces a private 1080x1920 three-scene video to catch layout, encoding,
    official logo and permanent Rio Madeira identity regressions.
    """
    with tempfile.TemporaryDirectory(prefix="giro-shorts-offline-qa-") as temporary:
        folder=Path(temporary)
        backdrop=render_text_only_background("POLÍCIA")
        river=render_clean_madeira_illustration()
        brand=Image.open(ROOT/"assets/logo-oficial.webp").convert("RGB")
        claim={
          "title":"TESTE VISUAL: GIRO MADEIRA VERIFICA AS CAPAS DOS SHORTS EM PORTO VELHO",
          "topic_scope":"rondonia",
          "source_name":"SIMULAÇÃO TÉCNICA — NÃO PUBLICAR",
          "urgent":True,
        }
        scenes=[
          "SIMULAÇÃO INTERNA DO NOVO PADRÃO VISUAL",
          "VALIDAÇÃO DE MANCHETE, CRÉDITOS E LOGO",
          "VALIDAÇÃO DO RIO MADEIRA E DO FORMATO VERTICAL",
        ]
        images=[]
        for idx,scene in enumerate(scenes):
            name=folder/("qa-frame-%d.png"%idx)
            make_frame(backdrop,river,brand,claim,scene,idx,
                       "arte original ilustrativa, sem foto externa",name)
            check=Image.open(name)
            if check.size!=(1080,1920):raise RuntimeError("QA frame dimensions incorrect")
            images.append(name)
        out=ROOT/"shorts-test-preview"
        out.mkdir(parents=True,exist_ok=True)
        from shutil import copyfile
        copyfile(images[0],out/"auto-qa-cover.png")
        audio=folder/"qa-music.wav"
        make_music(audio,27)
        video=out/"auto-qa-video.mp4"
        render_frames(images,video,audio)
        print(json.dumps({
          "success":True,
          "mode":"offline_self_test_no_upload",
          "preview":str(out/"auto-qa-cover.png"),
          "video":str(video),
          "video_bytes":video.stat().st_size,
          "expected_dimensions":"1080x1920",
          "media_upload_attempted":False,
        },ensure_ascii=False))


def main():
    # Never claim or publish during a git push, even if old flags are present.
    # The --self-test mode below renders locally, without credentials or uploads.
    if os.environ.get("GITHUB_EVENT_NAME")=="push":
        print("Push event is QA-only; bridge claims and uploads are disabled.")
        return
    token=github_token()
    result=bridge(token,"claim")
    if not result.get("processed"):
        print("Nothing eligible:",result.get("reason","no candidate"))
        return
    qid=result["queue_id"]
    try:
      with tempfile.TemporaryDirectory(prefix="giro-shorts-") as tmp:
        folder=Path(tmp)
        query,category=article_subject(result["title"])
        # O padrão visual aprovado exige fotografia REAL, licenciada e pertinente.
        # Se nenhuma foto válida existir, bloquear o Short em vez de publicar arte genérica.
        try:
            picture,credit,file_title=licensed_openverse_photo(query)
        except Exception as primary_error:
            print("Openverse without topical licensed photo:",type(primary_error).__name__)
            picture,credit,file_title=licensed_commons_download(query)
        if not credit.startswith(("openverse_","wikimedia_")):
            raise RuntimeError("Visual standard failed: unlicensed or non-photographic hero")
        logo=Image.open(ROOT/"assets/logo-oficial.webp").convert("RGB")
        # O Rio Madeira segue presente no rodapé. Priorizar fotografia CC0 regional.
        try:
            river_photo,_,_=licensed_local_madeira_photo()
            river=cover(river_photo,W,230)
        except Exception as regional_error:
            print("Regional CC0 footer unavailable; keeping original Rio Madeira artwork:",
                  type(regional_error).__name__)
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
        # Checagem de qualidade estrutural: não confundir renderização concluída
        # com conformidade visual. Fotografia ligada à pauta é condição obrigatória.
        if len(frames)!=3 or not credit.startswith(("openverse_","wikimedia_")):
            raise RuntimeError("Approved visual QA failed: photo/scene requirements")
        for frame in frames:
            with Image.open(frame) as review:
                if review.size!=(1080,1920) or review.mode!="RGB":
                    raise RuntimeError("Approved visual QA failed: vertical 1080x1920")
        frames[0].replace(preview_dir/("fila-"+str(qid)+".png"))
        with video.open("rb") as f:
            response=requests.put(result["upload_url"],data=f,headers={"Content-Type":"video/mp4","x-upsert":"false"},
              timeout=130)
        if response.status_code not in (200,201):
            raise RuntimeError("Supabase signed upload failed with HTTP "+str(response.status_code))
        confirmed=bridge(token,"complete",queue_id=qid,storage_path=result["storage_path"],
                 quality_passed=(len(frames)==3 and credit.startswith(("openverse_","wikimedia_"))),image_credit=credit)
        print("Rendered and stored approved video for queue",confirmed["queue_id"])
        print("Openverse-licensed illustration:",file_title)
    except Exception as e:
        try: bridge(token,"fail",queue_id=qid)
        except Exception: print("Could not update queue error status.")
        raise RuntimeError("Render failed safely without publishing: "+str(e)[:150]) from e

if __name__=="__main__":
    if "--self-test" in sys.argv:
        render_self_test()
    else:
        main()
