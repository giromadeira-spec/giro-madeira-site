#!/usr/bin/env python3
"""Demonstracao: monta um motion graphics de teste a partir de demo.json (nada e publicado)."""
import sys, os, json, shutil
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import giro_motion, giro_voz, giro_broll

cfgin = json.load(open(sys.argv[1], encoding="utf-8")); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
title, scenes, cat = cfgin["title"], cfgin["scenes"], cfgin["category"]
beats = giro_motion.build_beats(title, scenes, cat, has_photo=False)
used = giro_broll.attach(beats, title, scenes, cat)
print("b-roll:", json.dumps(used, ensure_ascii=False))
voices = giro_voz.narrate([b["txt"] for b in beats], str(out))
if voices:
    for b, v in zip(beats, voices):
        if v: b["voz"] = str(v)
cfg = {"tag": cat, "title": title, "fonte": cfgin["fonte"], "teste": True, "beats": beats, "photo": None, "photo_credit": "", "_dir": "."}
video = out / "demo.mp4"; total = giro_motion.render_video(cfg, video)
json.dump({"duracao_s": round(total, 1), "narracao": bool(voices), "broll": used}, open(out / "relatorio.json", "w"), ensure_ascii=False, indent=1)
for f in out.glob("*.wav"): f.unlink()
for f in out.glob("*.mp3"): f.unlink()
print("ok", total)
