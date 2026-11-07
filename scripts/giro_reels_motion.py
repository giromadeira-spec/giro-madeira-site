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

def scene_images(ident):
    base = qa.ROOT + "/storage/v1/object/public/news-images/auto/jpeg/reel/" + str(int(ident)) + "/"
    imgs = []
    for n in range(1, 7):
        try: imgs.append(sa.fetch_picture(base + str(n) + ".jpg"))
        except Exception: imgs.append(None)
    return imgs

def claim_one(tok, rid, extra):
    params = {"action": "claim", **({"publication_id": rid} if rid else {}), **extra}
    resp = requests.post(qa.BRIDGE, params=params, headers={"Authorization": "Bearer " + tok}, timeout=35)
    if resp.status_code >= 400: raise RuntimeError("claim_http_%s: %s" % (resp.status_code, resp.text[:600]))
    return resp.json()

def pick(tok, requested):
    """Manual (reel_id): usa esse Reel. Automatico: o primeiro Reel pendente que ja tem >=4 imagens por cena."""
    if requested:
        extra = {"variant": "kokoro55"} if requested == 226 else {}
        data = claim_one(tok, requested, extra)
        return (data, extra, scene_images(requested)) if data.get("available") else (None, extra, None)
    first = claim_one(tok, 0, {})
    if not first.get("available"): return None, {}, None
    top = int(first["publication_id"])
    for rid in [top] + list(range(top - 1, max(top - 60, 0), -1)):
        data = first if rid == top else claim_one(tok, rid, {})
        if not data.get("available"): continue
        imgs = scene_images(rid)
        have = sum(im is not None for im in imgs)
        print("Reel", rid, "imagens por cena:", have)
        if have >= 4: return data, {}, imgs
    return None, {}, None

def main():
    tok = qa.token()
    requested = int(os.environ.get("GIRO_TEST_REEL_ID", "0") or "0")
    data, extra, scene_imgs = pick(tok, requested)
    if not data:
        print("NO_REEL_READY (nenhum Reel pendente com imagens por cena suficientes)"); return
    ident = data["publication_id"]
    try:
        result = build_result(data)
        picture = None
        url = data.get("image_url") or ""
        if url.startswith(qa.ROOT + "/storage/v1/object/public/news-images/"):
            try: picture = sa.fetch_picture(url)
            except Exception as exc: print("sem imagem editorial:", str(exc)[:100])
        got = [im is not None for im in scene_imgs]
        print("Imagens por cena do Reel:", got)
        with tempfile.TemporaryDirectory(prefix="giro-reel-motion-") as tmp:
            video, dur, narrated = sa.render_motion(result, "", tmp, "Giro Madeira",
                picture=None if any(got) else picture, scene_images=scene_imgs)
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
