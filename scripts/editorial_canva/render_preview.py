#!/usr/bin/env python3
"""Render exported Canva storyboard pages locally. No network or paid APIs.

Input must be five 1080x1920 PNG exports named page-1.png through page-5.png.
This command produces a review preview and never uploads or publishes it.
"""
import argparse
import json
import math
import subprocess
import tempfile
import wave
from pathlib import Path
from PIL import Image

DURATIONS={'reels':[2,4,5,5,2],'tiktok':[2,3,4,3,2],'shorts':[2,5,5,6,2]}

def soundtrack(filename,duration):
    # Original synthesized tones. No samples from reference videos or catalogs.
    rate=24000
    with wave.open(str(filename),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(rate)
        for sec in range(duration):
            buf=bytearray()
            for i in range(sec*rate,(sec+1)*rate):
                t=i/rate
                envelope=max(0,min(1,t/.5,(duration-t)/.8))
                pulse=.65+.35*(math.sin(2*math.pi*1.25*t)**4)
                v=(.08*math.sin(2*math.pi*110*t)+.035*math.sin(2*math.pi*164.81*t)+.025*math.sin(2*math.pi*220*t))*envelope*pulse
                buf.extend(int(v*28000).to_bytes(2,'little',signed=True))
            out.writeframes(buf)

def render(frames_dir,channel,output):
    durations=DURATIONS[channel]
    frames=[Path(frames_dir)/f'page-{n}.png' for n in range(1,6)]
    for f in frames:
        with Image.open(f) as im:
            if im.size!=(1080,1920):raise ValueError('Expected 1080x1920 Canva exports')
    output=Path(output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='giro-canva-preview-') as tmp:
        tmp=Path(tmp)
        for i,(frame,duration) in enumerate(zip(frames,durations)):
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30','-i',str(frame),'-t',str(duration),'-vf',f'fade=t=in:st=0:d=0.18,fade=t=out:st={duration-.18}:d=0.18','-c:v','libx264','-preset','veryfast','-threads','2','-crf','24','-pix_fmt','yuv420p','-an',str(tmp/f'scene-{i}.mp4')],check=True,timeout=120)
        (tmp/'concat.txt').write_text(''.join(f"file 'scene-{i}.mp4'\n" for i in range(5)))
        soundtrack(tmp/'original.wav',sum(durations))
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(tmp/'concat.txt'),'-i',str(tmp/'original.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','96k','-movflags','+faststart','-shortest',str(output)],check=True,timeout=40)
    result={'channel':channel,'duration_seconds':sum(durations),'scene_seconds':durations,'width':1080,'height':1920,'fps':30,'soundtrack':'original_synthesized_no_samples','reference_only':True,'publish_allowed':False,'output':str(output)}
    output.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--frames-dir',required=True);p.add_argument('--channel',choices=DURATIONS,required=True);p.add_argument('--output',required=True)
    a=p.parse_args();render(a.frames_dir,a.channel,a.output)
