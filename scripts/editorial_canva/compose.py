#!/usr/bin/env python3
"""Free local composition from verified local media; no network or publication."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from review_packet import validate

NAVY=(4,17,40);YELLOW=(255,212,0);WHITE=(250,250,254)

def font(size,bold=True):
    names=['DejaVuSansCondensed-Bold.ttf','DejaVuSans-Bold.ttf'] if bold else ['DejaVuSans.ttf']
    for name in names:
        p=Path('/usr/share/fonts/truetype/dejavu')/name
        if p.exists():return ImageFont.truetype(str(p),size)
    raise ValueError('Free DejaVu font not installed')

def fitted_lines(draw,value,width,size,max_lines):
    if not isinstance(value,str) or not value.strip():raise ValueError('text_required')
    for point in range(size,35,-2):
        f=font(point);lines=[];line=''
        for word in value.upper().split():
            if draw.textlength(word,font=f)>width:break
            candidate=(line+' '+word).strip()
            if line and draw.textlength(candidate,font=f)>width:lines.append(line);line=word
            else:line=candidate
        else:
            if line:lines.append(line)
            if len(lines)<=max_lines:return lines,f,point
    raise ValueError('headline_overflows_safe_area')

def wrapped(draw,value,xy,width,size,max_lines,color=WHITE,bold=False):
    # Caption text is never silently truncated to make a render pass QA.
    f=font(size,bold);lines=[];line=''
    for word in value.split():
        if draw.textlength(word,font=f)>width:raise ValueError('caption_overflow')
        candidate=(line+' '+word).strip()
        if line and draw.textlength(candidate,font=f)>width:lines.append(line);line=word
        else:line=candidate
    if line:lines.append(line)
    if len(lines)>max_lines:raise ValueError('caption_overflow')
    for i,line in enumerate(lines):draw.text((xy[0],xy[1]+i*(size+7)),line,font=f,fill=color)

def frame(record,scene,photo,river,logo,height,preview):
    hero_h=690 if height==1080 else 1120
    out=Image.new('RGB',(1080,height),NAVY)
    out.paste(ImageOps.fit(photo.convert('RGB'),(1080,hero_h)),(0,0))
    layer=Image.new('RGBA',out.size,(0,0,0,0));d=ImageDraw.Draw(layer)
    start=420 if height==1080 else 830
    for y in range(start,height):
        a=min(255,int(255*(y-start)/(hero_h-start)))
        d.line((0,y,1080,y),fill=(*NAVY,a))
    out=Image.alpha_composite(out.convert('RGBA'),layer).convert('RGB');d=ImageDraw.Draw(out)
    logo_size=200 if height==1080 else 222
    out.paste(ImageOps.contain(logo.convert('RGB'),(logo_size,logo_size)),(58,42 if height==1080 else 190))
    x=58;right=1022 if height==1080 else 900;width=right-x
    y=526 if height==1080 else 1030
    d.polygon([(x,y),(x+450,y),(x+432,y+54),(x,y+54)],fill=(222,31,45) if record.get('urgent') is True else YELLOW)
    category=record.get('category','EDITORIA').upper()
    if d.textlength(category,font=font(27))>400:raise ValueError('category_overflow')
    d.text((x+18,y+9),category,font=font(27),fill=WHITE if record.get('urgent') is True else NAVY)
    local=record.get('location','LOCAL DO FATO').upper()
    wrapped(d,local,(600 if height==1080 else 495,70 if height==1080 else 232),400,24,2,YELLOW,True)
    text_y=600 if height==1080 else 1110
    lines,f,point=fitted_lines(d,scene['headline'],width,68 if height==1080 else 82,3)
    for i,line in enumerate(lines):d.text((x,text_y+i*(point+9)),line,font=f,fill=YELLOW if i==1 else WHITE)
    wrapped(d,scene.get('support',''),(x,846 if height==1080 else 1400),width,27 if height==1080 else 33,1 if height==1080 else 2)
    wrapped(d,'Fonte: '+record.get('source_label','teste técnico'),(x,884 if height==1080 else 1520),width,20 if height==1080 else 24,1 if height==1080 else 2)
    if scene.get('statistic') and height!=1080:wrapped(d,scene['statistic'],(x,1610),width,34,1,YELLOW,True)
    out.paste(ImageOps.fit(river.convert('RGB'),(1080,156)),(0,height-156))
    layer=Image.new('RGBA',out.size,(0,0,0,0));ImageDraw.Draw(layer).rectangle((0,height-156,1080,height),fill=(*NAVY,170))
    out=Image.alpha_composite(out.convert('RGBA'),layer).convert('RGB');d=ImageDraw.Draw(out)
    d.rectangle((0,height-160,1080,height-156),fill=YELLOW)
    d.text((58,height-126),'RIO MADEIRA / ASSINATURA REGIONAL',font=font(22),fill=WHITE)
    wrapped(d,record.get('photo_credit','Imagem regional CC0 para teste'),(58,height-88),964,20,1)
    label='TESTE INTERNO / IMAGEM REGIONAL / NÃO PUBLICAR' if preview else 'RASCUNHO / AGUARDA REVISÃO EDITORIAL'
    wrapped(d,label,(58,height-48),964,21,1,YELLOW,True)
    return out

def compose(record,photo_path,river_path,logo_path,folder,preview=False):
    issues=validate(record)
    if not preview and issues:raise ValueError('Editorial hold: '+','.join(issues))
    if preview and record.get('reference_only') is not True:raise ValueError('preview_requires_reference_only')
    photo_path=Path(photo_path)
    digest=hashlib.sha256(photo_path.read_bytes()).hexdigest()
    if not preview and record.get('photo',{}).get('sha256')!=digest:raise ValueError('photo_sha256_mismatch')
    channel=record['channel'];scenes=record.get('scenes',[])
    if len(scenes)!=(1 if channel in {'feed','stories'} else 5):raise ValueError('scene_count_invalid')
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    with Image.open(photo_path) as photo,Image.open(river_path) as river,Image.open(logo_path) as logo:
        if photo.width<900 or photo.height<650:raise ValueError('photo_resolution_low')
        for i,scene in enumerate(scenes,1):
            im=frame(record,scene,photo,river,logo,1080 if channel=='feed' else 1920,preview)
            temporary=folder/f'.page-{i}.png.tmp'
            im.save(temporary,format='PNG')
            with Image.open(temporary) as check:check.verify()
            temporary.replace(folder/f'page-{i}.png')
    result={'channel':channel,'reference_only':preview,'publish_allowed':False,'photo_sha256':digest,'pages':len(scenes),'issues':issues,'mode':'local_composition_review_only'}
    (folder/'composition.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest');p.add_argument('--photo',required=True);p.add_argument('--river',required=True);p.add_argument('--logo',required=True);p.add_argument('--out',required=True);p.add_argument('--template-preview',action='store_true')
    a=p.parse_args();print(json.dumps(compose(json.loads(Path(a.manifest).read_text()),a.photo,a.river,a.logo,a.out,a.template_preview)))
