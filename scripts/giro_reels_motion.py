#!/usr/bin/env python3
"""Giro Madeira Reels no estilo motion graphics + voz pm_alex (mesmo motor dos Shorts/TikTok).
MODO QA: pega um Reel pela ponte QA (GitHub OIDC), monta o video e envia so o MP4 para QA.
Nao chama a API do Instagram, nao aprova e nao publica. Texto vem so do resumo ja verificado.
"""
import json, os, re, sys, tempfile
from pathlib import Path
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import giro_reels_qa_actions as qa       # token, claim, verify, ponte QA
import giro_shorts_auto as sa            # render_motion, fetch_picture, clean

def sentences(text):
    t = sa.clean(re.sub(r"<[^>]+>", " ", str(text or "")))
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", t) if len(s.strip()) > 8]

def build_result(item):
    title = sa.clean(item.get("title"))
    summ = sentences(item.get("summary"))
    if title and summ and summ[0].lower().startswith(title.lower()[:40]):
        summ = summ[1:]
    scenes = summ[:7]
    if len(" ".join(scenes)) < 40:
        raise RuntimeError("editorial_narration_too_short")
    return {"title": title, "scenes": scenes, "source_name": sa.clean(item.get("source_name") or "Giro Madeira")}

def main():
    tok = qa.token()
    requested = int(os.environ.get("GIRO_TEST_REEL_ID", "0") or "0")
    extra = {"variant": "kokoro55"} if requested == 226 else {}   # ponte permite repetir o 226
    params = {"action": "claim", **({"publication_id": requested} if requested else {}), **extra}
    resp = requests.post(qa.BRIDGE, params=params, headers={"Authorization": "Bearer " + tok}, timeout=35)
    if resp.status_code >= 400: raise RuntimeError("claim_http_%s: %s" % (resp.status_code, resp.text[:600]))
    data = resp.json()
    if not data.get("available"):
        print("NO_ELIGIBLE_REEL " + str(data.get("reason"))); return
    ident = data["publication_id"]
    try:
        result = build_result(data)
        picture = None
        url = data.get("image_url") or ""
        if url.startswith(qa.ROOT + "/storage/v1/object/public/news-images/"):
            try: picture = sa.fetch_picture(url)
            except Exception as exc: print("sem imagem editorial:", str(exc)[:100])
        with tempfile.TemporaryDirectory(prefix="giro-reel-motion-") as tmp:
            video, dur, narrated = sa.render_motion(result, "", tmp, "Giro Madeira", picture=picture)
            if not narrated: raise RuntimeError("reel_without_narration")
            headers = qa.verify(video)
            payload = Path(video).read_bytes()
            if len(payload) > 35_000_000: raise RuntimeError("video_exceeds_35MB")
            headers.update({"Authorization": "Bearer " + tok, "Content-Type": "video/mp4"})
            sent = requests.post(qa.BRIDGE, params={"action": "upload", "publication_id": ident, **extra},
                                 headers=headers, data=payload, timeout=120)
            sent.raise_for_status()
            out = sent.json()
            if not out.get("success"): raise RuntimeError("upload_rejected: " + str(out))
            print("QA_MOTION_REEL_COMPLETE " + json.dumps(out, ensure_ascii=False) + " narrated=" + str(narrated) + " dur=" + str(round(dur, 1)))
            Path("reel-motion-qa").mkdir(exist_ok=True)
            Path("reel-motion-qa/reel-motion.mp4").write_bytes(payload)
    except Exception:
        print("QA_MOTION_REEL_FAILED_FOR_ID " + str(ident)); raise

if __name__ == "__main__":
    main()
