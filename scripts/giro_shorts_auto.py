#!/usr/bin/env python3
"""Giro Madeira Shorts/TikTok: only source-linked verified event photography.
Runs only on GitHub Actions via OIDC. Failure means NO publication.
Never uses unrelated stock photos, unlicensed publisher media or paid APIs.
"""
import hashlib, html, io, json, math, os, random, re, subprocess, sys, tempfile, time, urllib.parse, wave
from pathlib import Path
from html.parser import HTMLParser
import unicodedata
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

SUPABASE="https://dsihvbdhocbqscaypraw.supabase.co"
PLATFORM="tiktok" if "--tiktok" in sys.argv else "shorts"
BRIDGE=SUPABASE+"/functions/v1/giro-"+PLATFORM+"-github-bridge"
AUD=BRIDGE
ROOT=Path(__file__).resolve().parents[1]
HEADERS={"User-Agent":"GiroMadeiraShorts/1.0 (editorial illustration; github.com/giromadeira-spec/giro-madeira-site)"}
W,H=1080,1920
NAVY=(4,17,40); YELLOW=(255,212,0); WHITE=(250,250,254)
ORIGINAL_CREDIT="arte editorial original Giro Madeira — sem fotografia externa"

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
    # News-specific topics must not be replaced by unrelated police, road or war imagery.
    if re.search(r"terremoto|abalo s[ií]smico|earthquake",t):
        return "seismic original", "MUNDO"
    if re.search(r"trem|ferrovia|eurot[uú]nel|metr[oô]|railway",t):
        return "railway original", "TRÂNSITO"
    # TikTok-only topic fixes; preserve the working Shorts classification.
    if PLATFORM == "tiktok":
        # A stabbing attack at a supermarket must not be illustrated by a globe.
        if re.search(r"facadas?|esfaquead",t) and re.search(r"supermercad",t):
            return "supermarket aisle", "SEGURANÇA"
        # Contextual, individually licensed images are preferred to generic world imagery.
        if re.search(r"r[uú]ss|ucr[aâ]ni|kharkiv|cessar[- ]fogo|bombardeio", t):
            return "ukraine war damage", "MUNDO"
        if re.search(r"paquist[aã]o|escolas? fechad|school closures", t):
            return "school building exterior", "MUNDO"
        if re.search(r"houthis|riad|riyadh|aeroport|bloqueia voos|suspender voos", t):
            return "aircraft airplane", "MUNDO"
        if re.search(r"trump.*(?:zelensky|putin|reuni[aã]o)|zelensky.*putin", t):
            return "diplomacy meeting", "MUNDO"
        if re.search(r"naufr[aá]gio|barco com imigrantes", t):
            return "ocean waves", "MUNDO"
        if re.search(r"furac[aã]o|tempestade", t):
            return "lightning storm", "CLIMA"
        if re.search(r"tsunami|terremoto|naufr[aá]gio|imigrantes|[aá]frica|paquist[aã]o|cessar[- ]fogo|houthis", t):
            return "world globe earth", "MUNDO"
        if re.search(r"\btse\b|tribunal|supremo|\bstf\b", t):
            return "justice gavel", "POLÍTICA"
        if re.search(r"br-\d+|colis[aã]o|tr[aâ]nsito|atropel|acidente.*(?:rodovia|carro|ve[ií]culo)", t):
            return "road traffic highway", "TRÂNSITO"
        if re.search(r"pres[ií]dio|prisional|policial penal|apreens[aã]o|apreende|mandado", t):
            return "police car emergency lights", "SEGURANÇA"
    mapping=[
     (r"(?=.*(?:crian[cç]as|adolescentes))(?=.*(?:internet|online|digital|redes sociais))|(?:crimes? de [oó]dio|amea[cç]as) na internet","cyber safety editorial","SEGURANÇA"),
     (r"cadastro [uú]nico|cad[uú]nico|bolsa fam[ií]lia","cadastro unico editorial graphic","SERVIÇOS"),
     (r"mosquito|dengue|aedes|zika|sa[uú]de|vacina|hospital","mosquito aedes aegypti macro","SAÚDE"),
     (r"gasolina|combust[ií]vel|petr[oó]leo|petrobras|posto","gas station petrol pump","ECONOMIA"),
     (r"clima|temporal|chuva|enchente|calor|seca|granizo","lightning storm","CLIMA"),
     # Incidentes aéreos: evitar fotos genéricas de polícia ou gráficas de jornal.
     (r"avi[aã]o|aeronave|helic[oó]ptero|aeroporto|acidente a[eé]reo|queda de avi[aã]o","aircraft airplane","SEGURANÇA"),
     # Road accidents and fire incidents should not be classified as unknown.
     # Generic scene photos are illustrative, never presented as the real event.
     (r"acidente.*(?:ve[ií]culos?|carros?|motos?|motociclet|caminh[aã]o|[oô]nibus)|colis[aã]o|atropel|tr[aâ]nsito|\bbr-\d+\b|(?:ve[ií]culos?|carros?).*acidente","road traffic highway","TRÂNSITO"),
     (r"inc[eê]ndio|bombeir|em chamas|pegou fogo","fire engine firefighting","SEGURANÇA"),
     (r"pol[ií]cia|\bpf\b|prendeu|pris[aã]o|feminic[ií]dio|investiga|\bpres[oa]s?\b|\bdetid[oa]s?\b|agred|agress|viol[eê]ncia dom[eé]stica|criminos[oa]|tr[aá]fico|boca de fumo|suspeit[oa]|homic[ií]dio|assassin|ex[eé]rcito","police car emergency lights","SEGURANÇA"),
     (r"elei[cç][aã]o|voto|urna|tse|tre-|stf|supremo|congresso|senado|deputad|bolsonaro|lula","brazil electronic voting machine","POLÍTICA"),
     (r"futebol|sele[cç][aã]o|atleta|jogo|copa|fifa|gol ","soccer ball field","ESPORTES"),
     (r"economia|infla[cç][aã]o|d[oó]lar|real|bolsa|banco|juros","financial city skyscrapers","ECONOMIA"),
     (r"tecnologia|intelig[eê]ncia artificial|internet|chip|rob[oô]","computer circuit board macro","TECNOLOGIA"),
     (r"bombardeio|r[uú]ssia|ucr[aâ]nia|guerra|ataque|internacional|mundo|eua|trump|china","world globe earth","MUNDO")
    ]
    for rx,query,category in mapping:
       if re.search(rx,t):return query,category
    # Unknown subject: no generic newspaper/printing-press imagery is editorially acceptable.
    # Hold the item until a topic-specific licensed photograph can be selected.
    return "", "NOTÍCIAS"


# Proveniência obrigatória: jamais escolher foto só pela categoria da manchete.
# Somente a imagem ligada À PRÓPRIA matéria, com legenda factual e licença reutilizável.
def event_tokens(text):
    plain=unicodedata.normalize("NFKD",clean(text)).encode("ascii","ignore").decode().lower()
    stop={"sobre","apos","para","pelo","pela","pelos","pelas","com","sem","entre","quando",
          "noticia","noticias","foto","imagem","reportagem","brasil","brasileiro",
          "novo","nova","hoje","ontem","foram","deixa","deixam","durante","mais",
          "sobre","onde","esta","sao","uma","dois","tres","quatro","cinco"}
    return {t for t in re.findall(r"[a-z0-9]{4,}",plain) if t not in stop}

def event_caption_matches(headline,caption):
    terms=event_tokens(headline)
    overlaps=terms & event_tokens(caption)
    return len(overlaps)>=2 and len(overlaps)>=min(3,len(terms))

class EventPageImages(HTMLParser):
    """Collect article photos, including lazy galleries and their own captions."""
    def __init__(self):
        super().__init__()
        self.meta={}
        self.images=[]
        self._figures=[]

    def _add_image(self,raw,alt):
        if not raw or len(raw)>2048 or len(self.images)>180:
            return
        entry=(html.unescape(raw.strip()),clean(html.unescape(alt or "")))
        if self._figures:
            self._figures[-1]["images"].append(entry)
        else:
            self.images.append(entry)

    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=="meta":
            key=(attrs.get("property") or attrs.get("name") or "").lower().strip()
            if key and attrs.get("content"):
                self.meta[key]=attrs["content"]
        if tag=="figure":
            self._figures.append({"images":[],"caption":[],"depth":0})
        if tag=="figcaption" and self._figures:
            self._figures[-1]["depth"]=1
        elif self._figures and self._figures[-1]["depth"]:
            self._figures[-1]["depth"]+=1
        if tag in ("img","source"):
            alt=attrs.get("alt") or attrs.get("title") or ""
            for key in ("src","data-src","data-original","data-lazy-src",
                        "data-full-src","data-image"):
                self._add_image(attrs.get(key),alt)
            for key in ("srcset","data-srcset"):
                for item in (attrs.get(key) or "").split(",")[:8]:
                    self._add_image(item.strip().split(" ")[0],alt)
        elif tag=="a" and self._figures:
            # Galleries sometimes link a larger Commons image than the thumbnail.
            link=attrs.get("href") or ""
            linked=urllib.parse.urlsplit(link)
            if (linked.scheme=="https" and
                (linked.hostname=="upload.wikimedia.org" or
                 (linked.hostname=="commons.wikimedia.org" and
                  linked.path.startswith("/wiki/File:")))):
                self._add_image(link,attrs.get("title") or "")

    def handle_data(self,data):
        if self._figures and self._figures[-1]["depth"]:
            self._figures[-1]["caption"].append(data)

    def handle_endtag(self,tag):
        if not self._figures:
            return
        item=self._figures[-1]
        if tag=="figure":
            item=self._figures.pop()
            caption=clean(" ".join(item["caption"]))
            for raw,alt in item["images"]:
                description=clean(" ".join(part for part in (alt,caption) if part))
                if self._figures:
                    self._figures[-1]["images"].append((raw,description))
                else:
                    self.images.append((raw,description))
        elif item["depth"]:
            item["depth"]-=1


def licensed_event_photo(source_url,headline):
    """Use only Commons photographs linked by this story, with factual captions and
    individually verified CC0 / CC-BY rights. Never infer a license from a portal.
    A nonreusable first image must not hide a later eligible gallery photograph.
    """
    parsed=urllib.parse.urlsplit(source_url)
    host=(parsed.hostname or "").lower()
    if (parsed.scheme!="https" or not host or host in {"localhost","127.0.0.1"} or
        host.endswith((".local",".internal")) or parsed.username or parsed.password):
        raise RuntimeError("Original news source URL invalid")
    response=requests.get(source_url,headers=HEADERS,timeout=18)
    response.raise_for_status()
    if "text/html" not in response.headers.get("Content-Type","text/html").lower() or len(response.content)>2_500_000:
        raise RuntimeError("Original story HTML unavailable or too large")
    page=EventPageImages()
    page.feed(response.text)
    title=page.meta.get("og:title","")
    if not event_caption_matches(headline,title):
        raise RuntimeError("Source page title does not match news headline")
    candidates=[]
    preview=page.meta.get("og:image","") or page.meta.get("twitter:image","")
    preview_alt=page.meta.get("og:image:alt","") or page.meta.get("twitter:image:alt","")
    if preview:
        candidates.append((urllib.parse.urljoin(response.url,preview),preview_alt))
    for raw,description in page.images:
        candidates.append((urllib.parse.urljoin(response.url,raw),description))

    checked_files=set()
    checked_count=0
    for candidate,description in candidates:
        image_url=urllib.parse.urlsplit(candidate)
        linked_commons=(image_url.hostname=="commons.wikimedia.org" and
                        image_url.path.startswith("/wiki/File:"))
        if image_url.scheme!="https" or not (image_url.hostname=="upload.wikimedia.org" or linked_commons):
            continue
        if re.search(r"ilustrativ|meramente|foto de arquivo|imagem de arquivo|stock|shutterstock|freepik|representa[cç][aã]o|montagem|gen[eé]ric|arquivo pessoal",description,re.I):
            continue
        if not description or not event_caption_matches(headline,description):
            continue
        parts=[urllib.parse.unquote(x) for x in image_url.path.split("/") if x]
        filename=(parts[-2] if "thumb" in parts and len(parts)>2 else parts[-1]) if parts else ""
        if linked_commons:
            filename=urllib.parse.unquote(image_url.path.split("/wiki/File:",1)[1]).replace("_"," ")
        if not re.search(r"\.(jpe?g|png|webp)$",filename,re.I):
            continue
        if filename in checked_files:
            continue
        checked_files.add(filename)
        checked_count+=1
        if checked_count>10:
            break  # Bound network work; never relax licensing to fill a slot.
        api=requests.get("https://commons.wikimedia.org/w/api.php",params={
            "action":"query","titles":"File:"+filename,"prop":"imageinfo",
            "iiprop":"url|size|extmetadata","iiurlwidth":"1600",
            "format":"json","formatversion":"2"
        },headers=HEADERS,timeout=20)
        api.raise_for_status()
        pages=api.json().get("query",{}).get("pages",[])
        for p in pages:
            info=(p.get("imageinfo") or [None])[0]
            if not info:
                continue
            meta=info.get("extmetadata") or {}
            lic=clean(html.unescape(re.sub("<[^>]*>"," ",str((meta.get("LicenseShortName") or {}).get("value","")))))
            license_url=str((meta.get("LicenseUrl") or {}).get("value",""))
            cc0=bool(re.search(r"\bCC0\b",lic,re.I) and "creativecommons.org/publicdomain/zero/" in license_url)
            ccby=bool(re.fullmatch(r"CC[ -]*BY[ -]*(?:2\.0|2\.5|3\.0|4\.0)",lic,re.I) and
                license_url.startswith("https://creativecommons.org/licenses/by/"))
            if not (cc0 or ccby):
                continue
            if int(info.get("width",0))<900 or int(info.get("height",0))<650:
                continue
            artist=clean(html.unescape(re.sub("<[^>]*>"," ",str((meta.get("Artist") or {}).get("value","")))))
            if ccby and not artist:
                continue
            pic=str(info.get("thumburl") or info.get("url") or "")
            if urllib.parse.urlsplit(pic).hostname not in ("upload.wikimedia.org","thumb.wikimedia.org"):
                continue
            actual=fetch_picture(pic)
            landing="https://commons.wikimedia.org/wiki/File:"+urllib.parse.quote(filename.replace(" ","_"),safe="()-_.")
            credit=("wikimedia_event_"+filename[:55]+" — "+artist[:65]+" — "+lic+" — "+landing)[:445]
            return actual,credit,filename
    raise RuntimeError("No source-linked Commons photograph with event-matching caption and verifiable reuse license")

def approved_registry_photo(item,source_url,headline):
    """Read a signed PRIVATE photo offered by the OIDC-verified Supabase bridge.

    The bridge checks approval, evidence, rights scope, article identity and expiry;
    it independently checks the same record again before accepting completed media.
    """
    if not isinstance(item,dict) or not isinstance(item.get("id"),int) or item["id"]<1:
        raise RuntimeError("Missing approved newsroom image ID")
    if item.get("article_url")!=source_url or item.get("headline")!=headline:
        raise RuntimeError("Newsroom image does not match exact source article")
    credit=str(item.get("image_credit") or "")
    if not credit.startswith("registered_event_"+str(item["id"])+" — ") or len(credit)>445:
        raise RuntimeError("Newsroom attribution was not issued by approved registry")
    pic=str(item.get("image_url") or "")
    parsed=urllib.parse.urlsplit(pic)
    expected="/storage/v1/object/sign/giro-imagens-autorizadas/approved/"
    if (parsed.scheme!="https" or parsed.hostname!="dsihvbdhocbqscaypraw.supabase.co" or
        not parsed.path.startswith(expected) or not parsed.query or
        parsed.username or parsed.password or ".." in parsed.path or "\\" in pic):
        raise RuntimeError("Only signed private newsroom images are permitted")
    return fetch_picture(pic),credit,"Giro Madeira arquivo autorizado #"+str(item["id"])


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
      "supermarket aisle":r"\b(supermarket|grocery store|supermercado)\b",
      "soccer ball field":r"\b(soccer ball|football ball|soccer field|football field)\b",
      "financial city skyscrapers":r"\b(skyscraper|financial district|financial center|financial centre)\b",
      "computer circuit board macro":r"\b(circuit board|printed circuit|motherboard)\b",
      "newspaper printing press":r"\b(printing press|newspaper printing|newspaper press)\b",
      "aircraft airplane":r"\b(aircraft|airplane|aeroplane|jetplane|avi[aã]o|aeronave|plane)\b",
      "road traffic highway":r"\b(highway traffic|road traffic|motorway traffic|traffic on|trafego|tráfego)\b",
      "fire engine firefighting":r"\b(fire engine|fire truck|fire brigade|firefighter|firefighters|firefighting|bombeiros)\b",
       "ukraine war damage":r"(?=.*\b(?:ukraine|ukrainian|ukraina|kharkiv|kyiv|kiev)\b)(?=.*\b(?:war|damage|damaged|destroyed|bomb|attack|shelling|conflict|strike|ruins)\b)",
       "school building exterior":r"\b(?:school|escola|schools)\b",
       "diplomacy meeting":r"\b(?:diplomacy|diplomatic|diplomat|summit|bilateral meeting|foreign ministers)\b",
       "ocean waves":r"\b(?:ocean waves|sea waves|rough sea|stormy sea)\b"
    }
    if PLATFORM == "tiktok":
        groups["justice gavel"] = r"\b(gavel|gavels|martelo de juiz)\b"
    pattern=groups.get(topic)
    if topic=="aircraft airplane" and re.search(r"\b(toy|model|paper plane|simulator|diagram|poster|illustration|drawing|game|cartoon)\b",title,re.I):
      return False
    return bool(pattern and re.search(pattern,title,re.I))

def photo_matches_story(headline, topic, image_title):
    """Reject unrelated stock photos even if broad category matches the headline."""
    if not photo_matches_topic(topic,image_title):
        return False
    if PLATFORM != "tiktok":
        return True
    head=clean(headline).lower()
    image=clean(image_title).lower()
    if topic=="world globe earth":
        return False
    if topic=="diplomacy meeting":
        leaders=[name for name in ("trump","zelensky","putin","lula","bolsonaro","biden")
                 if name in head]
        if leaders and sum(name in image for name in leaders)<min(2,len(leaders)):
            return False
    # Metadata must anchor international incidents to the country/city mentioned.
    places=[
        (r"\b(coreia do sul|seul|incheon)\b",r"\b(south korea|korea|korean|incheon|seoul|coreia)\b"),
        (r"\b(paquist[aã]o|paquistan[eê]s)\b",r"\b(pakistan|pakistani|paquist[aã]o)\b"),
        (r"\b(riad|riyadh|ar[aá]bia saudita|houthis|iem[eê]n)\b",
         r"\b(riyadh|riad|saudi|yemen|houthi)\b"),
        (r"\b(m[eé]xico|mexican[oa])\b",r"\b(mexico|mexican|m[eé]xico)\b"),
    ]
    for headline_place,image_place in places:
        if re.search(headline_place,head) and not re.search(image_place,image):
            return False
    if topic=="police car emergency lights" and re.search(
        r"\b(porto velho|rond[oô]nia|em ro|em mt)\b",head
    ) and not re.search(r"\b(brasil|brazil|porto velho|rond[oô]nia|mato grosso)\b",image):
        return False
    return True

def licensed_commons_download(topic):
    """Fallback: Wikimedia Commons photo with per-file licensing, subject and bytes verified."""
    endpoint="https://commons.wikimedia.org/w/api.php"
    fallback_terms={
      "road traffic highway":["highway traffic", "road traffic"],
      "fire engine firefighting":["fire engine", "fire truck", "fire brigade"],
      "justice gavel":["gavel", "judge gavel"],
      "world globe earth":["EXACT:File:The Earth seen from Apollo 17.jpg", "earth globe", "world globe", "globe"],
       "ukraine war damage":["Ukraine war damage","Ukraine damaged buildings"],
       "school building exterior":["school building exterior","school exterior"],
       "diplomacy meeting":["diplomatic meeting","diplomacy summit"],
       "ocean waves":["ocean waves storm","rough sea waves"],
      "brazil electronic voting machine":["urna eletrônica", "electronic voting machine"],
      "police car emergency lights":["police car", "police vehicle"],
      "supermarket aisle":["supermarket aisle", "supermarket interior"],
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
       if re.search(r"\b(building|brick|house|church|chapel|school|roof|architecture|protest|demonstration|person|people)\b",title,re.I) and topic!="school building exterior":continue
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


def original_illustration_credit(source_url,headline):
    """Deterministic claim provenance, not a license for third-party photographs."""
    if not (str(source_url).startswith("https://") and str(headline).strip()):
        raise RuntimeError("Cannot issue editorial illustration credit without verified story reference")
    signature=hashlib.sha256((source_url+"\n"+headline).encode("utf-8")).hexdigest()[:24]
    return "original_editorial_labeled_v2_"+signature


def is_acceptable_visual_credit(credit,source_url,headline):
    """Never treat an illustration as a documentary photograph."""
    return (str(credit).startswith(("wikimedia_event_","registered_event_")) or
            credit==original_illustration_credit(source_url,headline))


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

def render_topic_illustration(headline,category):
    """Original symbolic illustration; not documentary evidence or publisher photography."""
    image=render_text_only_background(category)
    d=ImageDraw.Draw(image)
    title=clean(headline).lower()
    accent=(247,206,24)
    muted=(96,148,187)
    if re.search(r"terremoto|abalo s[ií]smico|earthquake",title):
        # Abstract seismograph and concentric waves, NOT an invented photograph.
        for rad in (90,175,260):
            d.ellipse((540-rad,510-rad,540+rad,510+rad),outline=muted,width=8)
        d.line([(172,545),(340,545),(385,486),(431,612),(488,450),(550,550),(615,492),(674,560),(892,560)],fill=accent,width=15,joint="curve")
    elif re.search(r"trem|ferrovia|eurot[uú]nel|metr[oô]|railway",title):
        # Symbolic rails. Do not depict an actual crash or victims.
        for a,b in ((390,192),(685,875)):
            d.line((a,340,b,785),fill=accent,width=13)
        for yy in (425,505,588,684):
            xa=390-(yy-340)*198/445
            xb=685+(yy-340)*190/445
            d.line((xa,yy,xb,yy),fill=muted,width=12)
    elif re.search(r"protest|manifesta[cç]|greve",title):
        # Pictograms and blank placards, never an invented documentary scene.
        for x,y in ((260,380),(500,325),(735,420)):
            d.rounded_rectangle((x-94,y,x+94,y+118),radius=12,fill=(15,40,69),outline=accent,width=9)
            d.line((x,y+118,x,y+290),fill=muted,width=13)
            d.ellipse((x-35,y+310,x+35,y+380),fill=muted)
        if re.search(r"fran[cç]a|franc[eê]s",title):
            for x,color in ((360,(42,87,173)),(480,(240,243,245)),(600,(204,58,66))):
                d.rectangle((x,690,x+120,735),fill=color)
    elif re.search(r"inc[eê]ndio|fogo",title):
        # A flat flame symbol; no victims, buildings or fabricated event photograph.
        d.polygon([(540,315),(665,475),(697,430),(785,628),(714,753),(377,753),(293,626),(409,451),(433,530)],fill=accent)
        d.polygon([(540,530),(631,675),(583,753),(479,753),(433,675)],fill=(17,42,68))
    elif re.search(r"crian[cç]as|adolescentes|internet|digital|cibern[eé]tico|online",title):
        # Digital safety: shield and padlock; never show minors.
        d.rounded_rectangle((244,317,834,720),radius=38,outline=muted,width=14)
        d.line([(540,381),(716,455),(693,598),(540,670),(387,598),(364,455),(540,381)],
               fill=accent,width=17,joint="curve")
        d.arc((467,476,613,604),180,360,fill=accent,width=14)
        d.rounded_rectangle((455,546,625,645),radius=12,outline=accent,width=12)
    elif re.search(r"energia|el[eé]tric|apag[aã]o|sem luz|r[uú]ss|ucr[aâ]ni",title):
        # Symbolic power grid; no invented explosion, injury or location.
        for xx in (274,744):
            d.line([(xx,720),(xx+72,332),(xx+140,720)],fill=accent,width=13)
            for yy in (421,512,610):
                d.line((xx+18,yy,xx+121,yy),fill=muted,width=11)
        d.line([(346,410),(530,350),(815,428)],fill=muted,width=8)
        d.line([(346,497),(530,448),(815,515)],fill=muted,width=8)
    elif re.search(r"acidente|rodovia|tr[aâ]nsito|colis[aã]o",title):
        d.polygon([(450,360),(640,360),(860,745),(190,745)],outline=accent,width=10)
        for yy in (415,513,631):
            d.line((540,yy,540,yy+44),fill=accent,width=14)
    else:
        d.line([(540,366),(770,474),(741,680),(540,767),(339,680),(310,474),(540,366)],
               fill=accent,width=20,joint="curve")
        d.line([(452,565),(515,630),(640,500)],fill=muted,width=23,joint="curve")
    return image

def cleared_editorial_contingency(claim):
    """17/10 authorization: topical original art, labeled and pending editorial review.

    The bridge must allow this channel explicitly. Unrecognized topics stay on hold;
    the generic shield and any third-party photograph are never a fallback here.
    """
    title=clean(claim.get("title", ""))
    if claim.get("allow_original_editorial_illustration") is not True:
        return None
    if not re.search(r"terremoto|abalo s[ií]smico|\btrem\b|ferrovia|eurot[uú]nel|metr[oô]|protest|manifesta[cç]|greve|inc[eê]ndio|fogo|internet|digital|cibern[eé]tico|online|energia|el[eé]tric|apag[aã]o|sem luz|acidente|rodovia|tr[aâ]nsito|colis[aã]o",title,re.I):
        return None
    _,category=article_subject(title)
    return (render_topic_illustration(title,category),
            original_illustration_credit(claim["source_url"],title),
            "Arte editorial original — ilustração simbólica, não é foto do acontecimento")

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
    if not Path(heavy).exists():heavy="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
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
    img=img.convert("RGBA")  # Preserve the source photograph; no synthetic face/detail edits.

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
    mark.thumbnail((170,170),Image.Resampling.LANCZOS)
    logo_x,logo_y=58,62
    img.alpha_composite(mark,(logo_x+(170-mark.width)//2,logo_y+(170-mark.height)//2))
    d=ImageDraw.Draw(img)

    # Yellow editorial topic flag with clean horizontal rule (screenshot style).
    _,subject=article_subject(claim["title"])
    category=clean(subject).upper()[:22]
    if category=="SEGURANÇA":category="POLÍCIA"
    tagfont=ImageFont.truetype(heavy,48)
    while d.textbbox((0,0),category,font=tagfont)[2]>620 and tagfont.size>30:
        tagfont=ImageFont.truetype(heavy,tagfont.size-2)
    tag_right=min(760,98+d.textbbox((0,0),category,font=tagfont)[2]+58)
    tag_top=1100
    d.polygon([(55,tag_top),(tag_right+28,tag_top),(tag_right,tag_top+74),(55,tag_top+74)],fill=YELLOW)
    d.text((85,tag_top+9),category,font=tagfont,fill=NAVY)
    d.line((tag_right+29,tag_top+69,1015,tag_top+69),fill=YELLOW,width=5)
    # Precise visual provenance: an actual event photo or a non-publication QA illustration.
    if credit.startswith(("wikimedia_event_","registered_event_")):
        photo_label="FOTO DA NOTÍCIA — LICENCIADA"
    elif credit.startswith("original_editorial_labeled_v2_"):
        photo_label="ILUSTRAÇÃO EDITORIAL — NÃO É FOTO"
    else:
        raise RuntimeError("Unrecognized visual origin: cannot label news media")
    provenance_font=ImageFont.truetype(regular,25)
    provenance_width=d.textbbox((0,0),photo_label,font=provenance_font)[2]
    if provenance_width>925:
        raise RuntimeError("Visual provenance label too wide for news frame")
    d.rounded_rectangle((58,1010,95+provenance_width,1058),radius=4,fill=(3,16,36,232))
    d.text((74,1022),photo_label,font=provenance_font,fill=WHITE)
    if claim.get("urgent") is True:
        d.rounded_rectangle((785,45,1034,117),radius=6,fill=(222,31,45,255))
        d.text((800,55),"URGENTE",font=ImageFont.truetype(heavy,43),fill=WHITE)

    # Strong center-lower headline. Fit the whole verified text or fail closed.
    head=clean(claim["title"].split("|")[0]) if idx==0 else clean(scene)
    start=1220
    for requested_size in (124,112,101,90,80,70,60):
        rows,tf=lines_for(d,head,requested_size,944,maxlines=3)
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
    fps=30 if PLATFORM=="shorts" else 15  # TikTok managed by its independent pipeline.
    concat=[]
    for idx,frame in enumerate(frames):
        segment=out.parent/("scene"+str(idx)+".mp4")
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-loop","1","-framerate",str(fps),"-i",str(frame),
         "-t","9","-vf","fade=t=in:st=0:d=0.3,fade=t=out:st=8.65:d=0.35",
         "-r",str(fps),"-c:v","libx264","-preset","veryfast","-crf","26","-pix_fmt","yuv420p","-an",str(segment)],
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
        "stream=width,height,codec_name,avg_frame_rate","-of","json",str(out)],capture_output=True,text=True,check=True)
    stream=json.loads(proc.stdout)["streams"][0]
    if stream.get("codec_name")!="h264" or stream["width"]!=1080 or stream["height"]!=1920:
        raise RuntimeError("Output video dimensions or codec invalid")
    if PLATFORM=="shorts":
        from fractions import Fraction
        if Fraction(str(stream.get("avg_frame_rate") or "0/1")) != Fraction(30,1):
            raise RuntimeError("Shorts output is not 30 fps")
        # Confirm the Shorts MP4 includes playable AAC audio and the full story.
        # This applies only to Shorts; the independent TikTok pipeline is unchanged.
        probe=subprocess.run(["ffprobe","-v","error","-show_entries",
            "format=duration:stream=codec_type,codec_name","-of","json",str(out)],
            capture_output=True,text=True,check=True)
        metadata=json.loads(probe.stdout)
        duration=float((metadata.get("format") or {}).get("duration") or 0)
        has_aac=any(p.get("codec_type")=="audio" and p.get("codec_name")=="aac"
                    for p in metadata.get("streams",[]))
        if not has_aac or not 25.0<=duration<=28.5:
            raise RuntimeError("Shorts output missing AAC audio or complete 27-second duration")

def render_self_test():
    """Offline QA: no OIDC, no Supabase, no YouTube and no network requests.

    Produces a private 1080x1920 three-scene video to catch layout, encoding,
    official logo and permanent Rio Madeira identity regressions.
    """
    # Real event provenance is required independently of broad category matching.
    page=EventPageImages()
    page.feed('<meta property="og:title" content="Polícia Federal prende suspeitos em Porto Velho">'+
              '<meta property="og:image:alt" content="Polícia Federal prende suspeitos em Porto Velho">')
    if not event_caption_matches("PF prende suspeitos em Porto Velho",page.meta["og:image:alt"]):
        raise RuntimeError("Source-linked event caption incorrectly rejected")
    if event_caption_matches("PF prende suspeitos em Porto Velho","Viatura de polícia do Rio de Janeiro"):
        raise RuntimeError("Unrelated event image caption accepted")
    if event_caption_matches("Ataques russos deixam cidades sem energia na Ucrânia","Globo terrestre visto do espaço"):
        raise RuntimeError("Generic global photo accepted as event evidence")
    # No topic-based Openverse/Commons fallback is ever invoked by main().
    # Regression: all three actual TikTok rejected crime titles MUST use police imagery.
    for headline in (
        "Cabo do Exército é preso suspeito de agredir companheira em Porto Velho",
        "Criminoso é preso acusado de gerenciar boca de fumo na zona Leste",
        "Suspeito de matar mulher em RO é preso com a esposa em MT",
    ):
        query, category = article_subject(headline)
        if (query,category) != ("police car emergency lights","SEGURANÇA"):
            raise RuntimeError("Crime headline misclassified: " + headline)
        if photo_matches_topic(query,"Cherokee Phoenix printing press"):
            raise RuntimeError("Unrelated printing-press photo passed semantic check")
        if not photo_matches_topic(query,"Police car emergency lights"):
            raise RuntimeError("Valid illustrative police photo rejected")
    if PLATFORM == "tiktok":
        for headline, expected in (
            ("Operação apreende trator, caminhão e madeira em Terra Indígena em RO", ("police car emergency lights", "SEGURANÇA")),
            ("Ocorrência no presídio Urso Panda relata apreensão de material proibido e denúncia entre servidores", ("police car emergency lights", "SEGURANÇA")),
            ("TSE derruba suspensão do canal Exército do Lula", ("justice gavel", "POLÍTICA")),
            ("Acidente na BR-393 deixa cinco mortos e nove feridos no RJ", ("road traffic highway", "TRÂNSITO")),
        ):
            if article_subject(headline) != expected:
                raise RuntimeError("TikTok headline misclassified: " + headline)
        for headline,expected in (
            ("Ataques russos deixam 22 feridos em Kharkiv, na Ucrânia",("ukraine war damage","MUNDO")),
            ("Ucrânia: Rússia atinge alvos do setor de energia",("ukraine war damage","MUNDO")),
            ("Céu sobre Riad fica vazio após ataques de houthis a aeroportos",("aircraft airplane","MUNDO")),
            ("Paquistão fecha escolas e bloqueia ruas",("school building exterior","MUNDO")),
            ("Trump quer reunião entre Zelensky e Putin",("diplomacy meeting","MUNDO")),
        ):
            if article_subject(headline)!=expected:
                raise RuntimeError("TikTok topical image mapping failed: "+headline)
        if photo_matches_topic("ukraine war damage","The Earth seen from Apollo 17.jpg"):
            raise RuntimeError("Unrelated Earth photo accepted for a war story")
        # Regression cases taken from previous TikTok render records.
        for headline,query,photo in (
            ("Ataque a facadas em supermercado deixa 8 feridos na Coreia do Sul",
             "world globe earth","The Earth seen from Apollo 17.jpg"),
            ("Paquistão fecha escolas e bloqueia ruas",
             "school building exterior","Miami Indian School"),
            ("Trump quer reunião entre Zelensky e Putin",
             "diplomacy meeting","Tallinn Digital Summit. Meeting of Emmanuel Macron"),
            ("Furacão Simon ameaça costa do México",
             "lightning storm","June lightning storm Seaside Park NJ"),
        ):
            if photo_matches_story(headline,query,photo):
                raise RuntimeError("TikTok accepted disconnected visual: "+headline)
        if article_subject("Ataque a facadas em supermercado na Coreia do Sul") != ("supermarket aisle","SEGURANÇA"):
            raise RuntimeError("Korean supermarket attack mapped to wrong illustration")
        if not photo_matches_story("Ataque em supermercado na Coreia do Sul",
                                   "supermarket aisle","South Korea supermarket aisle"):
            raise RuntimeError("Relevant Korean supermarket photo rejected")
    if PLATFORM in ("shorts","tiktok"):
        # Incomplete newsroom storyboards fail safely even if original art is available.
        from unittest.mock import patch
        for headline in (
            "Ataques russos deixam cidades sem energia na Ucrânia",
            "PF faz operação contra crimes de ódio e violência sexual contra crianças na internet",
        ):
            calls=[]
            def fake_bridge(token,action,**kwargs):
                calls.append(action)
                return {"processed":True,"queue_id":207,"title":headline,"source_url":"https://news.example.org/story"} if action=="claim" else {"success":True}
            with patch.dict(os.environ,{"GITHUB_EVENT_NAME":"workflow_dispatch"}), \
                 patch(__name__+".github_token",return_value="offline-test"), \
                 patch(__name__+".bridge",side_effect=fake_bridge), \
                 patch(__name__+".licensed_event_photo",side_effect=RuntimeError("no event photo")), \
                 patch(__name__+".render_topic_illustration") as illustration, \
                 patch.object(requests,"put") as upload:
                try:
                    main()
                except RuntimeError as error:
                    if "Render failed safely" not in str(error):
                        raise
                else:
                    raise RuntimeError("Test with incomplete storyboard must fail before upload")
                if calls!=["claim","fail"]:
                    raise RuntimeError("Incomplete storyboard incorrectly advanced to publication")
                illustration.assert_not_called()
                upload.assert_not_called()
    if article_subject("PF faz operação contra crimes de ódio e violência sexual contra crianças na internet") != ("cyber safety editorial","SEGURANÇA"):
        raise RuntimeError("Child cybercrime story must use safe symbolic visuals")
    if render_topic_illustration("Ataques russos deixam cidades sem energia na Ucrânia","MUNDO").size!=(W,H):
        raise RuntimeError("Energy illustration must be 1080x1920")
    for headline, expected in (
        ("Mulher fica ferida após acidente envolvendo quatro veículos na Farquar", ("road traffic highway", "TRÂNSITO")),
        ("Ônibus são atingidos por incêndio em garagem de frigorífico", ("fire engine firefighting", "SEGURANÇA")),
    ):
        if article_subject(headline) != expected:
            raise RuntimeError("Shorts accident/fire headline misclassified: " + headline)
    if not photo_matches_topic("road traffic highway", "Highway traffic in Brazil"):
        raise RuntimeError("Valid road-traffic photo rejected")
    if photo_matches_topic("road traffic highway", "Cherokee Phoenix printing press"):
        raise RuntimeError("Unrelated traffic photo accepted")
    if not photo_matches_topic("fire engine firefighting", "Fire engine at station"):
        raise RuntimeError("Valid fire-engine photo rejected")
    if article_subject("Evento inédito em Porto Velho")[0]:
        raise RuntimeError("Unknown editorial subject accepted unrelated default photo")
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
                       original_illustration_credit("https://example.org/qa",
                            claim["title"]),name)
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


def report_render_outcome(outcome):
    """Record renderer outcome separately from approval and remote delivery."""
    outcome={"channel":PLATFORM,"publication_attempted":False,**outcome}
    print(json.dumps(outcome,ensure_ascii=False))
    out=ROOT/"artifacts";out.mkdir(exist_ok=True)
    (out/("render-"+PLATFORM+".json")).write_text(json.dumps(outcome,ensure_ascii=False,indent=2))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"],"a") as f:
            f.write("\n### Render "+PLATFORM+"\n\n```json\n"+json.dumps(outcome,ensure_ascii=False,indent=2)+"\n```\n")

def main():
    # Never claim or publish during a git push, even if old flags are present.
    # The --self-test mode below renders locally, without credentials or uploads.
    if os.environ.get("GITHUB_EVENT_NAME")=="push":
        print("Push event is QA-only; bridge claims and uploads are disabled.")
        return
    token=github_token()
    result=bridge(token,"claim")
    if not result.get("processed"):
        report_render_outcome({"state":"idle","reason":result.get("reason","no_candidate"),"ready_to_publish":False})
        return
    qid=result["queue_id"]
    try:
      with tempfile.TemporaryDirectory(prefix="giro-shorts-") as tmp:
        folder=Path(tmp)
        query,category=article_subject(result["title"])
        if not result.get("title") or not result.get("source_url"):
            raise RuntimeError("Verified news title and original source required")
        if not isinstance(result.get("scenes"),list) or len(result["scenes"])!=3:
            raise RuntimeError("Verified three-scene storyboard required")
        # Event photo or individually cleared private image. Missing rights stays
        # on the same item for review; no generic shield substitutes for the event.
        registered_image_id=0
        try:
            picture,credit,file_title=licensed_event_photo(result["source_url"],result["title"])
        except Exception as no_photo:
            registered=result.get("registered_image")
            if registered:
                picture,credit,file_title=approved_registry_photo(
                    registered,result["source_url"],result["title"])
                registered_image_id=registered["id"]
            else:
                # Photo-rights failure cannot justify copying a news-site image.
                # A topic-specific, self-authored illustration is permitted only
                # when this independent channel explicitly enables the fallback.
                contingency=cleared_editorial_contingency(result)
                if contingency is None:
                    bridge(token,"photo_pending",queue_id=qid)
                    report_render_outcome({"state":"awaiting_licensed_event_photo","queue_id":qid,
                                           "ready_to_publish":False,"reason":"event_photo_rights_review_required"})
                    return
                picture,credit,file_title=contingency
                print("No cleared event photo; rendering clearly labeled original editorial art for review.")
        visual_origin_valid=is_acceptable_visual_credit(
            credit,result["source_url"],result["title"])
        if not visual_origin_valid:
            raise RuntimeError("Visual origin verification failed")
        if category=="SEGURANÇA" and re.search(r"press|newspaper|cherokee|printing",file_title,re.I):
            raise RuntimeError("Crime headline cannot use unrelated newspaper imagery")
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
        # Checagem estrutural é distinta de aprovação editorial. Arte original
        # claramente rotulada permanece pendente, nunca comprova a ocorrência.
        visual_origin_valid=is_acceptable_visual_credit(
            credit,result["source_url"],result["title"])
        if len(frames)!=3 or not visual_origin_valid:
            raise RuntimeError("Visual QA failed: event photo or source-bound labeled artwork required")
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
                 quality_passed=(len(frames)==3 and visual_origin_valid),image_credit=credit,
                 visual_kind=("illustration" if credit.startswith("original_editorial_labeled_v2_") else "event_photo"),
                 registered_image_id=registered_image_id)
        report_render_outcome({"state":"ready_for_publication" if confirmed.get("ready_to_publish") is True else "awaiting_editorial_visual_review",
                              "queue_id":confirmed["queue_id"],"ready_to_publish":confirmed.get("ready_to_publish") is True,
                              "visual_kind":"illustration" if credit.startswith("original_editorial_labeled_v2_") else "event_photo"})
        print("Visual provenance:",file_title)
        print("Original labeled illustration:",credit.startswith("original_editorial_labeled_v2_"))
    except Exception as e:
        report_render_outcome({"state":"failed","queue_id":qid,"ready_to_publish":False,"reason":type(e).__name__})
        try: bridge(token,"fail",queue_id=qid)
        except Exception: print("Could not update queue error status.")
        raise RuntimeError("Render failed safely without publishing: "+str(e)[:150]) from e

if __name__=="__main__":
    if "--self-test" in sys.argv:
        render_self_test()
    else:
        main()



