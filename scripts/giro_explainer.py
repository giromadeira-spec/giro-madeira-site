#!/usr/bin/env python3
"""Video explicativo do Giro Madeira (so QA): gancho, personagens com foto, listas, carimbos, caminhos e pergunta final.
Texto so da pauta verificada; o que nao e confirmado entra marcado como pergunta/hipotese. Voz pm_alex fluida."""
import os, io, re, sys, math, subprocess, tempfile, unicodedata
from pathlib import Path
import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ["GIRO_VOZ_FLUIDA"] = "1"
import giro_motion as gm
import giro_voz
from giro_motion import W, H, FPS, YEL, WHITE, font, FD, FM, FB, ease, back, clamp, bg, wrap

UA = {"User-Agent": "GiroMadeiraBot/1.0 (jornal digital Porto Velho; contato giromadeira@gmail.com)"}
GREEN, RED, GOLD = (46, 204, 113), (231, 76, 60), (255, 176, 32)
PANEL = (16, 22, 36)

def _norm(s): return "".join(c for c in unicodedata.normalize("NFD", str(s).lower()) if unicodedata.category(c) != "Mn")

# ------------------------------------------------------------------ fotos (Commons, licenca verificada por arquivo)
def commons_photo(query, must=(), portrait=True):
    try:
        r = requests.get("https://commons.wikimedia.org/w/api.php", headers=UA, timeout=25, params={
            "action": "query", "format": "json", "generator": "search", "gsrsearch": query + " filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 15,
            "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 1200})
        r.raise_for_status()
    except Exception as e:
        print("commons falhou:", query, str(e)[:80]); return None
    for pg in sorted((r.json().get("query", {}).get("pages") or {}).values(), key=lambda p: p.get("index", 99)):
        ii = (pg.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata") or {}
        lic = _norm((md.get("LicenseShortName") or {}).get("value", ""))
        ok = lic.startswith("cc0") or lic.startswith("public domain") or lic == "pd" or re.fullmatch(r"cc by \d(\.\d)?( br)?", lic)
        if not ok: continue
        title = _norm(pg.get("title", ""))
        if any(_norm(m) not in title + " " + _norm(re.sub(r"<[^>]+>", "", (md.get("ImageDescription") or {}).get("value", ""))) for m in must): continue
        if portrait and (ii.get("thumbheight") or 1) < (ii.get("thumbwidth") or 1) * 0.9: continue
        try:
            im = Image.open(io.BytesIO(requests.get(ii.get("thumburl") or ii["url"], headers=UA, timeout=40).content)).convert("RGB")
        except Exception: continue
        artist = re.sub(r"<[^>]+>", "", (md.get("Artist") or {}).get("value", "autor desconhecido")).strip()[:36]
        print("foto ok:", query, "->", pg.get("title"), "|", lic, "|", artist)
        return {"img": im, "credit": "%s / Wikimedia Commons" % artist}
    print("sem foto verificada para:", query); return None

def cover_crop(im, w, h, top=0.15):
    k = max(w / im.width, h / im.height); im = im.resize((int(im.width * k) + 1, int(im.height * k) + 1), Image.LANCZOS)
    x = (im.width - w) // 2; y = int((im.height - h) * top); return im.crop((x, y, x + w, y + h))

# ------------------------------------------------------------------ elementos
def ph_card(person, w=330, k=1.0, tilt=-3):
    """Cartao polaroid: foto (ou silhueta), nome e cargo."""
    ph = int(w * 1.05); pad = 14; hh = ph + 130
    c = Image.new("RGBA", (w + 2 * pad, hh + pad), (244, 244, 240, 255)); d = ImageDraw.Draw(c)
    if person.get("img") is not None: c.paste(cover_crop(person["img"], w, ph), (pad, pad))
    else:
        d.rectangle([pad, pad, pad + w, pad + ph], fill=(40, 52, 78)); d.ellipse([pad + w // 2 - 55, pad + 70, pad + w // 2 + 55, pad + 180], fill=(90, 105, 135))
        d.pieslice([pad + w // 2 - 110, pad + 200, pad + w // 2 + 110, pad + 200 + 220], 180, 360, fill=(90, 105, 135)); d.rectangle([pad + w // 2 - 110, pad + 310, pad + w // 2 + 110, pad + ph], fill=(90, 105, 135))
    nm = person["nome"].upper(); f = font(FD, 30)
    while f.getlength(nm) > w and f.size > 18: f = font(FD, f.size - 2)
    d.text((pad + w // 2, pad + ph + 42), nm, font=f, fill=(20, 20, 28), anchor="mm")
    d.text((pad + w // 2, pad + ph + 92), person.get("cargo", ""), font=font(FM, 24), fill=(80, 80, 90), anchor="mm")
    out = Image.new("RGBA", (c.width + 40, c.height + 40), (0, 0, 0, 0)); sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle([26, 34, c.width + 20, c.height + 28], fill=(0, 0, 0, 150)); out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    out.alpha_composite(c, (20, 20)); out = out.rotate(tilt, resample=Image.BICUBIC, expand=True)
    return out if k == 1 else out.resize((int(out.width * k), int(out.height * k)), Image.LANCZOS)

def pill(cv, x, y, w, text, a=1.0, mark=None, col=WHITE, edge=(255, 255, 255), size=34, h=84, num=None):
    if a <= 0: return
    L = Image.new("RGBA", (w + 6, h + 6), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    d.rounded_rectangle([2, 2, w + 2, h + 2], 18, fill=PANEL + (255,), outline=edge + (150,), width=3)
    tx = 28
    if num is not None:
        d.ellipse([18, h // 2 - 26, 70, h // 2 + 26], fill=GOLD + (255,)); d.text((44, h // 2 + 1), str(num), font=font(FD, 30), fill=(20, 20, 28), anchor="mm"); tx = 90
    f = font(FD, size)
    while f.getlength(text.upper()) > w - tx - (70 if mark else 24) and f.size > 20: f = font(FD, f.size - 2)
    d.text((tx, h // 2), text.upper(), font=f, fill=col, anchor="lm")
    if mark == "ok":
        d.ellipse([w - 62, h // 2 - 22, w - 18, h // 2 + 22], fill=RED + (255,)); d.line([(w - 52, h // 2), (w - 43, h // 2 + 10), (w - 27, h // 2 - 9)], fill=WHITE, width=6)
    if mark == "q": d.text((w - 40, h // 2), "?", font=font(FD, 44), fill=GOLD, anchor="mm")
    dx = int((1 - ease(a)) * 140)
    L2 = L.copy(); L2.putalpha(L.getchannel("A").point(lambda v: int(v * clamp(a * 1.4)))); cv.alpha_composite(L2, (x + dx, y))

def head(cv, text, hi, y=250, kicker=None):
    d = ImageDraw.Draw(cv)
    if kicker: d.text((60, y - 70), "| " + kicker.upper(), font=font(FM, 26), fill=(190, 198, 215), anchor="lm")
    f = font(FD, 62); words = text.split(); lines = wrap(words, f, 960); x0 = 60
    for li, line in enumerate(lines):
        x = x0
        for wd in line:
            col = YEL if re.sub(r"\W", "", wd).lower() in [h.lower() for h in hi] else WHITE
            d.text((x, y + li * 76), wd, font=f, fill=col); x += f.getlength(wd + " ")
    return y + len(lines) * 76

def stamp(cv, text, a, cx=540, cy=900, size=84, col=GOLD, rot=-7):
    if a <= 0: return
    f = font(FD, size); w = int(f.getlength(text)) + 90; h = int(size * 1.7)
    L = Image.new("RGBA", (w + 20, h + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    d.rounded_rectangle([8, 8, w + 8, h + 8], 14, outline=col + (255,), width=8); d.text(((w + 16) // 2, (h + 16) // 2), text, font=f, fill=col + (255,), anchor="mm")
    k = 1.0 + 0.9 * (1 - back(a)) if a < 1 else 1.0
    L = L.rotate(rot, resample=Image.BICUBIC, expand=True); L = L.resize((int(L.width * k), int(L.height * k)), Image.LANCZOS)
    L.putalpha(L.getchannel("A").point(lambda v: int(v * clamp(a * 2)))); cv.alpha_composite(L, (int(cx - L.width / 2), int(cy - L.height / 2)))

def caption(cv, text, hi):
    d = ImageDraw.Draw(cv); f = font(FD, 50); words = text.upper().split(); lines = wrap(words, f, 960)[:3]
    y0 = 1560 - (len(lines) - 1) * 32
    for li, line in enumerate(lines):
        tw = f.getlength(" ".join(line)); x = 540 - tw / 2
        for wd in line:
            col = YEL if re.sub(r"\W", "", wd).lower() in [h.lower() for h in hi] else WHITE
            d.text((x, y0 + li * 64), wd, font=f, fill=col, stroke_width=6, stroke_fill=(0, 0, 0)); x += f.getlength(wd + " ")

def buttons(cv, a, labels=("SIM", "NÃO")):
    if a <= 0: return
    d = ImageDraw.Draw(cv)
    for i, (lab, col) in enumerate(zip(labels, (GREEN, RED))):
        x0 = 130 + i * 420; d.rounded_rectangle([x0, 1000, x0 + 380, 1110], 30, outline=col + (255,), width=6, fill=(col[0] // 6, col[1] // 6, col[2] // 6, 255))
        d.text((x0 + 190, 1055), lab, font=font(FD, 48), fill=col, anchor="mm")

# ------------------------------------------------------------------ cenas
class Scene:
    def __init__(s, voz, hi=(), draw=None): s.voz = voz; s.hi = list(hi); s.draw = draw; s.dur = 5.0; s.path = None

def build(pessoas, lugar):
    P = pessoas
    sc = []
    def s_title(v, cv, t, d, tt):
        if lugar and lugar.get("img") is not None:
            im = cover_crop(lugar["img"], W, H, 0.4).convert("RGBA"); k = 1 + 0.06 * (t / d); im = im.resize((int(W * k), int(H * k))); im = im.crop(((im.width - W) // 2, (im.height - H) // 2, (im.width - W) // 2 + W, (im.height - H) // 2 + H))
            sh = Image.new("RGBA", (W, H), (2, 8, 20, 170)); im.alpha_composite(sh); cv.paste(im, (0, 0))
        head(cv, "Fachin quer ouvir a PGR sobre o caso Master.", ["PGR", "Master"], 330, "STF · caso Master")
        stamp(cv, "ENTENDA", ease((t - 0.6) / 0.4), 540, 900, 96, YEL, -5)
    def s_people(v, cv, t, d, tt):
        head(cv, "Quem assinou os despachos", ["despachos"], 330, "quarta-feira, dia 4")
        cv.alpha_composite(ph_card(P[0], 400, 1.0, -3), (int(310 + (1 - ease(t / 0.5)) * -500), 500))
        pill(cv, 80, 1160, 920, "Despachos assinados", ease((t - 0.9) / 0.4), "ok")
        pill(cv, 80, 1270, 920, "Quer ouvir a PGR", ease((t - 2.0) / 0.4), "ok")
    def s_fronts(v, cv, t, d, tt):
        head(cv, "As frentes de investigação", ["frentes"], 330, "caso Master")
        pill(cv, 70, 670, 940, "Suspeitas de fraude", ease((t - 0.5) / 0.4), num=1, h=110, size=40)
        pill(cv, 70, 810, 940, "Operações Master e BRB", ease((t - 2.2) / 0.4), num=2, h=110, size=40)
        d_ = ImageDraw.Draw(cv); d_.text((70, 990), "BRB = Banco de Brasília", font=font(FM, 32), fill=(190, 198, 215))
    def s_prov(v, cv, t, d, tt):
        head(cv, "O que é a medida", ["medida"], 330, "o que se sabe")
        stamp(cv, "PROVISÓRIA", ease((t - 0.5) / 0.4), 540, 860, 96, GOLD, -7)
        pill(cv, 70, 1110, 940, "Impasse dentro da Corte", ease((t - 2.4) / 0.4), "ok")
    def s_nao(v, cv, t, d, tt):
        head(cv, "O que ainda não se sabe", ["não"], 330, "sem resposta")
        pill(cv, 70, 670, 940, "Prazo da PGR para responder", ease((t - 0.6) / 0.4), "q", h=110, size=36)
        pill(cv, 70, 810, 940, "Como o impasse será resolvido", ease((t - 2.4) / 0.4), "q", h=110, size=36)
    def s_hip(v, cv, t, d, tt):
        head(cv, "Cenários possíveis", ["hipótese"], 330, "só hipótese, nada confirmado")
        stamp(cv, "HIPÓTESE", ease((t - 0.3) / 0.4), 540, 730, 80, GOLD, -5)
        pill(cv, 70, 930, 940, "PGR dá parecer: caso segue", ease((t - 1.6) / 0.4), col=GREEN, edge=GREEN, h=110, size=34)
        pill(cv, 70, 1080, 940, "PGR demora: caso espera", ease((t - 3.2) / 0.4), col=GOLD, edge=GOLD, h=110, size=34)
    def s_q(v, cv, t, d, tt):
        head(cv, "Ouvir a PGR primeiro é o caminho certo?", ["PGR", "certo"], 340, "e você?")
        buttons(cv, ease((t - 0.5) / 0.4))
        dd = ImageDraw.Draw(cv); a = ease((t - 1.2) / 0.4)
        if a > 0:
            dd.text((540, 1220), "COMENTA AQUI EMBAIXO", font=font(FD, 38), fill=WHITE, anchor="mm"); dd.polygon([(520, 1260), (560, 1260), (540, 1290)], fill=YEL)
            dd.rounded_rectangle([340, 1330, 740, 1410], 14, fill=YEL); dd.text((540, 1370), "GIRO MADEIRA", font=font(FD, 40), fill=(20, 20, 28), anchor="mm")
            dd.text((540, 1450), "PARTE 2 QUANDO A PGR RESPONDER", font=font(FM, 28), fill=GOLD, anchor="mm")
    sc.append(Scene("Fachin quer ouvir a PGR sobre as investigações do caso Master. Entenda em um minuto.", ["PGR", "Master"], s_title))
    sc.append(Scene("Os despachos foram assinados na quarta-feira, dia quatro, pelo presidente do STF, Edson Fachin.", ["despachos", "Fachin"], s_people))
    sc.append(Scene("As frentes são as suspeitas de fraude em operações entre o Master e o BRB, o Banco de Brasília.", ["fraude", "BRB"], s_fronts))
    sc.append(Scene("A medida é provisória e acontece em meio a um impasse dentro da Corte. Na prática, Fachin ainda não decidiu nada. Primeiro ele quer ouvir a PGR.", ["provisória", "PGR"], s_prov))
    sc.append(Scene("Agora, o que ainda não se sabe: quanto tempo a PGR vai levar para responder, e como o impasse na Corte vai ser resolvido.", ["não", "PGR"], s_nao))
    sc.append(Scene("Será que o parecer pode mudar o rumo das investigações? É só uma hipótese. Nada foi confirmado.", ["hipótese", "confirmado"], s_hip))
    sc.append(Scene("E você, o que acha? Ouvir a PGR primeiro é o caminho certo? Conta aqui nos comentários. Segue o Giro Madeira para a parte dois.", ["PGR", "certo"], s_q))
    return sc

def render(out, sc, fonte, creditos):
    tmp = tempfile.mkdtemp(prefix="expl-")
    voices = giro_voz.narrate([s.voz for s in sc], tmp)
    if not voices and os.environ.get("GIRO_EXPL_SEMVOZ") == "1":  # so previa local sem Kokoro
        import wave
        voices = []
        for i, sx in enumerate(sc):
            pth = os.path.join(tmp, "v%d.wav" % i); n = int(len(sx.voz.split()) * 0.36 * 24000)
            with wave.open(pth, "wb") as wf: wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(24000); wf.writeframes(b"\x00\x00" * n)
            voices.append(pth)
    if not voices: raise RuntimeError("sem voz")
    starts = []; t0 = 0.0
    for s, vp in zip(sc, voices):
        s.path = str(vp); s.dur = gm.probe_dur(s.path) + 0.25; starts.append(t0); t0 += s.dur
    OUT = 2.6; total = t0 + OUT
    selo = Image.open(os.path.join(gm.ASSETS, "giro-logo-oficial.png")).convert("RGBA").resize((150, 150), Image.LANCZOS)
    music = gm.synth_audio(total, starts) * 0.22; vt = np.zeros_like(music)
    for st, s in zip(starts, sc):
        x = gm.load_pcm(s.path); a = int((st + 0.06) * gm.SR if hasattr(gm, "SR") else (st + 0.06) * 44100); b = min(len(vt), a + len(x)); vt[a:b] += x[:b - a]
    if vt.any(): vt /= max(1e-6, np.abs(vt).max()) / 0.9
    m = music + vt; sd = os.path.join(gm.ASSETS, "sfx"); SRR = gm.SR if hasattr(gm, "SR") else 44100
    p = os.path.join(sd, "transicao_swoosh_curto.wav")
    if os.path.exists(p):
        x = gm.load_pcm(p) * 0.4
        for st in starts:
            a = int(st * SRR); b = min(len(m), a + len(x)); m[a:b] += x[:b - a]
    m = m / max(1.0, np.abs(m).max()); wp = str(out) + ".wav"; gm.write_wav(wp, m)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-", "-i", wp,
           "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(total * FPS)):
        t = i / FPS
        if t >= total - OUT:
            cv = bg("navy", t).convert("RGBA"); k = back((t - (total - OUT)) / 0.5); s2 = selo.resize((int(380 * k) or 1, int(380 * k) or 1), Image.LANCZOS)
            logo = Image.open(os.path.join(gm.ASSETS, "giro-logo-oficial.png")).convert("RGBA").resize((int(380 * k) or 1, int(380 * k) or 1), Image.LANCZOS)
            cv.alpha_composite(logo, (540 - logo.width // 2, 820 - logo.height // 2)); dd = ImageDraw.Draw(cv)
            dd.text((540, 1200), "@GIRO_MADEIRA", font=font(FD, 64), fill=YEL, anchor="mm"); frame = cv.convert("RGB")
        else:
            idx = max(j for j, s0 in enumerate(starts) if s0 <= t); s = sc[idx]; lt = t - starts[idx]
            cv = bg("dark", t).convert("RGBA"); s.draw(s, cv, lt, s.dur, t)
            ws = s.voz.split(); ch = [" ".join(ws[k:k + 6]) for k in range(0, len(ws), 6)]
            caption(cv, ch[min(len(ch) - 1, int(lt / (s.dur - 0.25) * len(ch)))], s.hi)
            dd = ImageDraw.Draw(cv); dd.rectangle([0, 0, W, 10], fill=(0, 0, 0, 40)); dd.rectangle([0, 0, W * t / total, 10], fill=YEL)
            cv.alpha_composite(selo, (34, 36))
            if os.environ.get("GIRO_EXPL_PREVIA") == "1": dd.text((W - 40, 70), "PRÉVIA DE TESTE", font=font(FD, 24), fill=(190, 198, 215), anchor="rm")
            dd.text((W // 2, H - 150), "Fontes: " + fonte, font=font(FM, 26), fill=(190, 198, 215), anchor="mm")
            if creditos: dd.text((W // 2, H - 110), "Fotos: " + creditos, font=font(FM, 22), fill=(150, 158, 175), anchor="mm")
            if lt < 0.08: cv = Image.blend(cv, Image.new("RGBA", cv.size, (255, 255, 255, 255)), 0.3 * (1 - lt / 0.08))
            frame = cv.convert("RGB")
        pr.stdin.write(frame.tobytes())
    pr.stdin.close()
    if pr.wait() != 0: raise RuntimeError("ffmpeg falhou")
    os.remove(wp); return total


# ------------------------------------------------------------------ roteiro automatico (so a partir da pauta verificada)
CARGO = r"(ministro|ministra|presidente|senador|senadora|deputado|deputada|governador|governadora|prefeito|prefeita|vereador|vereadora|juiz|juíza|desembargador|desembargadora|procurador-geral|procuradora-geral|secretário|secretária)"
NOME = r"[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+"
PERSON_RX = re.compile(r"\b(?i:" + CARGO + r")(?:\s+(?:do|da|de)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\w+)?\s+(" + NOME + r"(?:\s+(?:d[aeo]s?\s+)?" + NOME + r"){0,3})")
TRAGEDY = re.compile(r"morr|mort|ferid|assassin|homic|crime|pres[oa]\b|prisao|prisão|policia|polícia|tiro|ataque|atentado|explos|estupr|abus|acidente|vitima|vítima|tragedia|tragédia|guerra|bomb|sequestr|trafico|tráfico|operacao|operação|massacre|suicid|desaparec|afog|incendi|queda", re.I)
STAMPS = [(r"provis[óo]ri", "PROVISÓRIA"), (r"sigilo", "EM SIGILO"), (r"liminar", "LIMINAR"), (r"suspens", "SUSPENSO"), (r"proib", "PROIBIDO"), (r"urgente|urgência", "URGENTE"), (r"aprovad", "APROVADO"), (r"rejeit|negad", "NEGADO"), (r"adiad", "ADIADO")]
UNKNOWN = re.compile(r"ainda n[ãa]o|sem previs[ãa]o|n[ãa]o h[áa] prazo|n[ãa]o foi divulgad|a definir", re.I)

def find_people(texts, limit=2):
    out = []; seen = set()
    for t in texts:
        for m in PERSON_RX.finditer(t):
            nome = m.group(2).strip(); key = _norm(nome)
            if key in seen or len(nome.split()) < 2 and len(nome) < 4: continue
            seen.add(key); out.append({"nome": nome, "cargo": m.group(1).lower(), "txt": t})
            if len(out) >= limit: return out
    return out

def fact_box(cv, y, text, a, num=None, mark=None, col=WHITE, edge=(255, 255, 255)):
    if a <= 0: return y
    f = font(FD, 40); lines = wrap(text.split(), f, 800 if num is not None else 840)[:5]; h = 40 + len(lines) * 54
    L = Image.new("RGBA", (944, h + 6), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    d.rounded_rectangle([2, 2, 942, h + 2], 20, fill=PANEL + (255,), outline=edge + (150,), width=3); tx = 34
    if num is not None:
        d.ellipse([20, 20, 76, 76], fill=GOLD + (255,)); d.text((48, 49), str(num), font=font(FD, 32), fill=(20, 20, 28), anchor="mm"); tx = 100
    for i, ln in enumerate(lines): d.text((tx, 22 + i * 54), " ".join(ln), font=f, fill=col)
    if mark == "q": d.text((900, 49), "?", font=font(FD, 50), fill=GOLD, anchor="mm")
    dx = int((1 - ease(a)) * 140); L.putalpha(L.getchannel("A").point(lambda v: int(v * clamp(a * 1.4)))); cv.alpha_composite(L, (60 + dx, int(y))); return y + h + 28

def auto_scenes(result, category, pessoas, picture):
    title = re.sub(r"\s+", " ", str(result["title"]).split("|")[0]).strip(); facts = [re.sub(r"\s+", " ", str(x)).strip() for x in result["scenes"] if str(x).strip()]
    kicker = (category or "Giro Madeira").title(); words = re.findall(r"[\wÀ-ú$%.,]+", title); hi_t = [max(words, key=lambda w: (bool(re.search(r"\d", w)), len(w)))] if words else []
    sc = []
    def hook(v, cv, t, d, tt):
        if picture is not None:
            im = cover_crop(picture.convert("RGB"), W, H, 0.4).convert("RGBA"); k = 1 + 0.06 * (t / d); im = im.resize((int(W * k), int(H * k)))
            im = im.crop(((im.width - W) // 2, (im.height - H) // 2, (im.width - W) // 2 + W, (im.height - H) // 2 + H)); im.alpha_composite(Image.new("RGBA", (W, H), (2, 8, 20, 170))); cv.paste(im, (0, 0))
        head(cv, title, hi_t, 330, kicker); stamp(cv, "ENTENDA", ease((t - 0.6) / 0.4), 540, 1000, 96, YEL, -5)
    sc.append(Scene(spoken_title(title) + " Entenda.", hi_t, hook))
    used = set()
    for i, ft in enumerate(facts):
        pe = next((p for p in pessoas if p["nome"] not in used and p["nome"].split()[-1].lower() in ft.lower()), None)
        st = next((lab for rx, lab in STAMPS if re.search(rx, ft, re.I)), None); unk = bool(UNKNOWN.search(ft)); n = i + 1
        hi = [w for w in re.findall(r"\w+", ft) if re.search(r"\d", w)][:2] or [max(re.findall(r"\w+", ft), key=len)]
        def draw(v, cv, t, d, tt, pe=pe, st=st, unk=unk, ft=ft, n=n):
            if pe is not None:
                head(cv, "Em foco", [], 330, kicker + " · " + str(n) + "/" + str(len(facts)))
                cv.alpha_composite(ph_card(pe, 360, 1.0, -3), (int(330 + (1 - ease(t / 0.5)) * -500), 470)); fact_box(cv, 1130, ft, ease((t - 0.8) / 0.4), mark="ok")
            elif st:
                head(cv, "O que se sabe", [], 330, kicker + " · " + str(n) + "/" + str(len(facts))); stamp(cv, st, ease((t - 0.5) / 0.4), 540, 760, 96, GOLD, -7); fact_box(cv, 960, ft, ease((t - 1.6) / 0.4))
            else:
                head(cv, "Ainda sem resposta" if unk else "O que se sabe", [], 330, kicker + " · " + str(n) + "/" + str(len(facts)))
                fact_box(cv, 520, ft, ease((t - 0.5) / 0.4), num=None if unk else n, mark="q" if unk else None)
        if pe is not None: used.add(pe["nome"])
        sc.append(Scene(ft, hi, draw))
    def q(v, cv, t, d, tt):
        head(cv, "E você, o que acha disso?", ["acha"], 340, "e você?"); buttons(cv, ease((t - 0.5) / 0.4), ("CONCORDO", "DISCORDO"))
        dd = ImageDraw.Draw(cv); a = ease((t - 1.2) / 0.4)
        if a > 0:
            dd.text((540, 1220), "COMENTA AQUI EMBAIXO", font=font(FD, 38), fill=WHITE, anchor="mm"); dd.polygon([(520, 1260), (560, 1260), (540, 1290)], fill=YEL)
            dd.rounded_rectangle([340, 1330, 740, 1410], 14, fill=YEL); dd.text((540, 1370), "GIRO MADEIRA", font=font(FD, 40), fill=(20, 20, 28), anchor="mm")
    sc.append(Scene("E você, o que acha disso? Conta aqui nos comentários. Segue o Giro Madeira.", ["acha"], q))
    return sc

def spoken_title(t): return t if t.endswith((".", "?", "!")) else t + "."

def render_auto(result, category, folder, picture=None):
    """Video explicativo automatico: so pauta verificada; foto de personagem so de cargo publico e fora de crime/tragedia."""
    texts = [str(result["title"])] + [str(x) for x in result["scenes"]]
    tragic = bool(TRAGEDY.search(" ".join(texts))) or (category or "").upper() in ("SEGURANÇA", "SEGURANCA")
    pessoas = []; creditos = []
    if not tragic:
        for pe in find_people(texts):
            ph = commons_photo(pe["nome"], [pe["nome"].split()[-1]])
            if ph: pe["img"] = ph["img"]; creditos.append(ph["credit"].replace(" / Wikimedia Commons", ""))
            pessoas.append(pe)
    sc = auto_scenes(result, category, pessoas, picture)
    cred = ("; ".join(dict.fromkeys(creditos))[:90] + " / Wikimedia Commons") if creditos else ""
    out = Path(folder) / "giro_short.mp4"
    dur = render(str(out), sc, str(result.get("source_name") or "Fonte"), cred)
    return out, dur, True

def exemplo(out="reel-motion-qa/reel-motion.mp4"):
    Path(out).parent.mkdir(exist_ok=True)
    fachin = {"nome": "Edson Fachin", "cargo": "presidente do STF"}
    f = commons_photo("Edson Fachin", ["fachin"])
    if f: fachin["img"] = f["img"]
    lugar = commons_photo("Supremo Tribunal Federal fachada Brasília", ["supremo"], portrait=False)
    cred = []
    if f: cred.append(f["credit"])
    if lugar: cred.append(lugar["credit"])
    d = render(out, build([fachin], lugar), "CNN Brasil, Poder360, Agência Brasil", "; ".join(dict.fromkeys(c.replace(" / Wikimedia Commons", "") for c in cred))[:90] + " / Wikimedia Commons")
    print("EXPLAINER_OK dur=%.1f foto_fachin=%s lugar=%s" % (d, bool(f), bool(lugar)))

if __name__ == "__main__":
    exemplo(*(sys.argv[1:2]))
