#!/usr/bin/env python3
"""Giro Madeira Reel 226 Kokoro pm_alex PT-BR / 18 scenes / 55s / QA only.
No Instagram API, no production mutations. Strict GitHub OIDC upload to Supabase QA.
"""
import json, math, os, re, subprocess, tempfile
from pathlib import Path
import numpy as np
import requests
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
from kokoro import KPipeline

BASE="https://dsihvbdhocbqscaypraw.supabase.co"
BRIDGE=BASE+"/functions/v1/giro-reels-github-render-bridge"
TEXT=(
"Uma operação policial chamou atenção em Rolim de Moura, no interior de Rondônia. "
"A Polícia Civil investiga uma suposta rede de tráfico de drogas ligada a uma facção criminosa na região. "
"Batizada de Operação Quirinus, a ação foi iniciada no dia seis de novembro. "
"Segundo os investigadores, o objetivo é alcançar integrantes de uma estrutura suspeita de distribuir entorpecentes na cidade. "
"A Delegacia de Repressão ao Crime Organizado, chamada Draco dois, conduziu os trabalhos. "
"A operação prevê o cumprimento de sete mandados de prisão preventiva, além de vinte e um mandados de busca e apreensão. "
"As medidas fazem parte de uma investigação anterior da própria unidade policial. "
"É importante lembrar que os investigados são suspeitos, e a responsabilidade de cada um ainda precisa ser apurada conforme a lei. "
"A Polícia Civil segue reunindo elementos sobre a atuação do grupo. "
"Giro Madeira: informação com responsabilidade."
)
SCENES=[
("OPERAÇÃO QUIRINUS","INVESTIGAÇÃO EM RONDÔNIA","police"),
("ROLIM DE MOURA","INTERIOR DO ESTADO","map"),
("AÇÃO POLICIAL","POLÍCIA CIVIL DE RONDÔNIA","police"),
("6 DE NOVEMBRO","INÍCIO DA OPERAÇÃO","calendar"),
("INVESTIGAÇÃO","COMBATE AO TRÁFICO","case"),
("REDE SUSPEITA","APURAÇÃO EM ANDAMENTO","network"),
("ESTRUTURA INVESTIGADA","DISTRIBUIÇÃO DE ENTORPECENTES","network"),
("DRACO 2","DELEGACIA ESPECIALIZADA","building"),
("OPERAÇÃO QUIRINUS","MANDADOS JUDICIAIS","document"),
("7 MANDADOS","PRISÃO PREVENTIVA","numbers"),
("21 MANDADOS","BUSCA E APREENSÃO","numbers"),
("EQUIPES EM CAMPO","CUMPRIMENTO DAS MEDIDAS","police"),
("INVESTIGAÇÃO ANTERIOR","DESDOBRAMENTO DA APURAÇÃO","documents"),
("SEM PRÉ-JULGAMENTO","SUSPEITOS SOB INVESTIGAÇÃO","justice"),
("DIREITO À DEFESA","RESPONSABILIDADE A APURAR","justice"),
("POLÍCIA CIVIL","REUNIÃO DE ELEMENTOS","case"),
("RONDÔNIA","INFORMAÇÃO COM RESPONSABILIDADE","map"),
("GIRO MADEIRA","ILUSTRAÇÃO EDITORIAL","brand"),
]
W,H=1080,1920
NAVY=(6,19,42); YELLOW=(255,183,3)
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def cmd(args, cwd=None, timeout=900):
    result=subprocess.run(args,cwd=cwd,text=True,capture_output=True,timeout=timeout)
    if result.returncode:
        raise RuntimeError(str(args[0])+" failed: "+result.stderr[-1600:])
    return result.stdout

def duration(path):
    raw=cmd(["ffprobe","-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",str(path)],timeout=30)
    return float(raw.strip())

def auth():
    ep=os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    tok=os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]
    r=requests.get(ep,headers={"Authorization":"Bearer "+tok},params={"audience":BRIDGE},timeout=25)
    r.raise_for_status()
    return r.json()["value"]

def bridge(token,action,**kwargs):
    r=requests.post(BRIDGE,params={"action":action,"publication_id":226,"variant":"kokoro55",**kwargs},
        headers={"Authorization":"Bearer "+token},timeout=45)
    if not r.ok:raise RuntimeError("qa bridge "+str(r.status_code)+" "+r.text[:550])
    body=r.json()
    if not body.get("success"):raise RuntimeError("qa bridge rejected "+repr(body))
    return body

def tts(path):
    print("KOKORO_INIT lang=p voice=pm_alex")
    pipeline=KPipeline(lang_code="p")
    chunks=[]
    for _gs,_ps,audio in pipeline(TEXT,voice="pm_alex",speed=1.0):
        if audio is not None:chunks.append(np.asarray(audio,dtype=np.float32))
    if not chunks:raise RuntimeError("Kokoro did not generate audio")
    samples=np.concatenate(chunks)
    sf.write(str(path),samples,24000)
    d=duration(path)
    print("KOKORO_AUDIO_SECONDS",d)
    return d

def center_crop(image,off=0):
    im=image.convert("RGB")
    scale=max(W/im.width,H/im.height)
    im=im.resize((int(im.width*scale),int(im.height*scale)),Image.Resampling.LANCZOS)
    x=max(0,(im.width-W)//2+off)
    y=max(0,(im.height-H)//2)
    return im.crop((min(x,im.width-W),y,min(x,im.width-W)+W,y+H))

def font(size,bold=True):
    return ImageFont.truetype(BOLD if bold else REG,size)

def fit(draw, text, maxw=880, maxsize=75):
    for n in range(maxsize,25,-2):
        f=font(n)
        if draw.textbbox((0,0),text,font=f)[2]<=maxw:return f
    return font(26)

def icon(draw,style,i):
    x,y=150,830
    gold=(255,198,44,215); white=(222,233,247,180)
    if style=="map":
        draw.rounded_rectangle((155,790,905,1180),radius=35,outline=gold,width=10)
        for j in range(5):draw.line((190,860+j*65,860,860+j*65),fill=(100,141,177,140),width=3)
        draw.ellipse((507,918,570,981),fill=gold)
        draw.line((537,978,537,1080),fill=gold,width=9)
    elif style=="network":
        pts=[(290,875),(560,850),(800,930),(435,1110),(730,1140)]
        for a,b in [(0,1),(1,2),(1,3),(2,4),(3,4)]:
            draw.line((*pts[a],*pts[b]),fill=(114,165,200,210),width=9)
        for px,py in pts:draw.ellipse((px-32,py-32,px+32,py+32),fill=gold)
    elif style in ("document","documents","case"):
        for j in range(3 if style=="documents" else 1):
            xx=360+j*40; yy=815+j*29
            draw.rounded_rectangle((xx,yy,730+j*40,1200+j*25),radius=20,fill=(27,50,78,240),outline=gold,width=8)
            for k in range(4):draw.line((xx+50,yy+100+k*56,xx+280,yy+100+k*56),fill=white,width=7)
    elif style=="calendar":
        draw.rounded_rectangle((275,810,820,1170),radius=28,outline=gold,width=10)
        draw.rectangle((285,825,810,910),fill=gold)
        draw.text((480,952),"06",font=font(135),fill=white)
    elif style in ("numbers","justice"):
        draw.rounded_rectangle((220,820,860,1170),radius=35,outline=gold,width=9)
        draw.line((325,1025,755,1025),fill=white,width=10)
        draw.ellipse((450,855,630,1035),outline=gold,width=8)
    elif style=="building":
        draw.rectangle((290,860,790,1180),outline=gold,width=10)
        draw.polygon([(250,860),(540,720),(830,860)],outline=gold)
        for j in range(3):draw.rectangle((350+j*140,920,420+j*140,1020),outline=white,width=6)
    else:
        draw.rounded_rectangle((225,855,855,1125),radius=34,outline=gold,width=9)
        draw.ellipse((300,900,380,980),fill=(44,133,213))
        draw.ellipse((700,900,780,980),fill=(219,65,57))
        draw.line((410,990,670,990),fill=white,width=8)

def make_scenes(story,folder):
    base=Image.open(story).convert("RGB")
    for i,(title,sub,style) in enumerate(SCENES):
        im=center_crop(base,int(math.sin(i*0.8)*50)).filter(ImageFilter.GaussianBlur(9+(i%4)*2))
        im=ImageEnhance.Brightness(im).enhance(0.30+(i%3)*0.05)
        mask=Image.new("RGBA",(W,H),(0,0,0,0))
        d=ImageDraw.Draw(mask,"RGBA")
        d.rectangle((0,0,W,H),fill=(0,11,29,90))
        d.rectangle((0,0,W,15),fill=YELLOW+(255,))
        d.rounded_rectangle((65,105,520,188),radius=24,fill=(255,183,3,235))
        d.text((88,121),"GIRO MADEIRA",font=font(38),fill=NAVY+(255,))
        d.text((75,315),f"CENA {i+1:02d}/18",font=font(30,False),fill=(255,210,91))
        ft=fit(d,title,maxw=930,maxsize=79)
        d.text((75,420),title,font=ft,fill=(252,254,255))
        d.line((74,535,1002,535),fill=YELLOW+(255,),width=7)
        d.text((75,600),sub,font=fit(d,sub,maxw=920,maxsize=45),fill=(238,244,252))
        icon(d,style,i)
        d.rounded_rectangle((75,1330,1005,1450),radius=22,fill=(2,13,33,230))
        d.text((105,1368),"IMAGEM ILUSTRATIVA • NÃO É FOTO DO FATO",
            font=fit(d,"IMAGEM ILUSTRATIVA • NÃO É FOTO DO FATO",maxw=865,maxsize=26),
            fill=(222,231,239))
        d.line((75,1665,1005,1665),fill=(255,183,3,190),width=5)
        d.text((80,1725),"GIRO MADEIRA • RONDÔNIA",font=font(29),fill=(242,246,251))
        out=Image.alpha_composite(im.convert("RGBA"),mask).convert("RGB")
        out.save(folder/f"{i+1:02}.jpg",quality=87,subsampling=0)
    print("STORYBOARD_SCENES",len(SCENES))

def subtitles(path,target=54.0):
    words=TEXT.split()
    groups=[" ".join(words[i:i+7]) for i in range(0,len(words),7)]
    weights=[len(s)+5 for s in groups]
    total=sum(weights); at=0
    def tc(sec):
        millis=int(sec*1000)
        return f"{millis//3600000:02}:{(millis//60000)%60:02}:{(millis//1000)%60:02},{millis%1000:03}"
    with open(path,"w",encoding="utf-8") as f:
        for j,(part,w) in enumerate(zip(groups,weights),1):
            end=min(target,at+w/total*target)
            f.write(f"{j}\n{tc(at)} --> {tc(end)}\n{part}\n\n")
            at=end

def generate(folder,voice_duration):
    make_scenes(folder/"story.jpg",folder)
    subtitles(folder/"subtitle.srt",53.4)
    # 18 images x 92 frames => 55.2 sec, 30fps; continuous gentle Ken Burns across all scenes
    speed=voice_duration/53.5
    if not (0.78<=speed<=1.28):raise RuntimeError(f"Kokoro duration {voice_duration:.1f}s cannot fit natural 55s")
    vf=("zoompan=z='min(zoom+0.0005,1.055)':"
        "x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=92:s=1080x1920:fps=30,"
        "subtitles=subtitle.srt:force_style='FontName=DejaVu Sans,FontSize=26,"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
        "BackColour=&H8805162D,BorderStyle=3,Outline=2,MarginV=150,Alignment=2',format=yuv420p")
    audio=f"[1:a]atempo={speed:.5f},volume=1.5[voice];[2:a]volume=0.012[bed];[voice][bed]amix=inputs=2:duration=longest[a]"
    args=["ffmpeg","-hide_banner","-loglevel","error","-y","-filter_threads","1",
       "-framerate","0.3272727273","-i","%02d.jpg",
       "-i","voice.wav","-f","lavfi","-i","sine=frequency=96:sample_rate=44100",
       "-filter_complex",f"[0:v]{vf}[v];{audio}",
       "-map","[v]","-map","[a]","-t","55.2","-r","30",
       "-c:v","libx264","-preset","ultrafast","-crf","28","-threads","2",
       "-pix_fmt","yuv420p","-c:a","aac","-b:a","112k","-movflags","+faststart",
       "reel-226-kokoro-qa.mp4"]
    cmd(args,cwd=folder,timeout=1200)
    return folder/"reel-226-kokoro-qa.mp4"

def verify(path):
    raw=cmd(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(path)],timeout=30)
    spec=json.loads(raw);v=next(x for x in spec["streams"] if x["codec_type"]=="video")
    a=next(x for x in spec["streams"] if x["codec_type"]=="audio")
    nums=[int(x) for x in v["avg_frame_rate"].split("/")]
    fps=nums[0]/nums[1]
    sec=float(spec["format"]["duration"])
    if (v["width"],v["height"])!=(1080,1920) or v["codec_name"]!="h264" or a["codec_name"]!="aac" or abs(fps-30)>0.3 or not 53<=sec<=57:
        raise RuntimeError("Invalid render "+str((v["width"],v["height"],fps,sec,v["codec_name"],a["codec_name"])))
    return {"x-giro-width":"1080","x-giro-height":"1920","x-giro-fps":f"{fps:.2f}",
      "x-giro-duration":f"{sec:.2f}","x-giro-vcodec":"h264","x-giro-acodec":"aac"}

def main():
    token=auth()
    info=bridge(token,"claim")
    if not info.get("available") or info.get("publication_id")!=226:raise RuntimeError("Reel 226 no longer eligible QA")
    with tempfile.TemporaryDirectory(prefix="giro-kokoro-226-") as tmp:
        folder=Path(tmp)
        u=str(info["image_url"])
        if not u.startswith(BASE+"/storage/v1/object/public/news-images/"):
            raise RuntimeError("Untrusted scene illustration source")
        r=requests.get(u,timeout=25)
        r.raise_for_status()
        if not (10000<len(r.content)<10_000_000):raise RuntimeError("invalid editorial art")
        (folder/"story.jpg").write_bytes(r.content)
        voicedur=tts(folder/"voice.wav")
        video=generate(folder,voicedur)
        headers=verify(video)
        content=video.read_bytes()
        if len(content)>35_000_000:raise RuntimeError("QA file above bridge cap")
        headers.update({"Content-Type":"video/mp4","Authorization":"Bearer "+token})
        output=requests.post(BRIDGE,params={"action":"upload","publication_id":"226","variant":"kokoro55"},
            headers=headers,data=content,timeout=120)
        if not output.ok:raise RuntimeError("Upload HTTP "+str(output.status_code)+" "+output.text[:500])
        result=output.json()
        if not result.get("success") or result.get("already_exists"):raise RuntimeError("QA upload not new "+str(result))
        print("KOKORO_VOICE pm_alex pt-BR")
        print("QA_18_SCENES_55_SEC",json.dumps(result,ensure_ascii=False))
if __name__=="__main__": main()
