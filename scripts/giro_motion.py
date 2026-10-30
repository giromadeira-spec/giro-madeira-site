#!/usr/bin/env python3
"""Motion graphics do Giro Madeira (1080x1920, 30 fps): texto cinetico, icones desenhados em codigo,
narracao e efeitos proprios (trilha sintetizada e biblioteca de efeitos autorais: sem direitos de terceiros).
Uso pelo pipeline: build_beats(titulo, cenas, categoria) -> render_video(cfg, saida.mp4)."""
import sys, os, json, math, subprocess, wave, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
NAVY, NAVY2, YEL, WHITE = (1, 29, 65), (0, 36, 83), (253, 220, 1), (255, 255, 255)
FD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts", "InterDisplay-Black.otf")
FM = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts", "InterDisplay-Medium.otf")
FB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts", "InterDisplay-Bold.otf")
HERE = os.path.dirname(os.path.abspath(__file__)); ASSETS = os.path.join(os.path.dirname(HERE), "assets")
SCENE, OUTRO = 5.0, 3.0
COVER_T = 0.20  # a capa ocupa os 6 primeiros frames (o audio nao muda); TikTok/Shorts usam o 1o quadro como capa

def clamp(x): return min(1.0, max(0.0, x))
def ease(x): x = clamp(x); return 1 - (1 - x) ** 3
def back(x):
    x = clamp(x); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def font(p, s): return ImageFont.truetype(p, int(s))
def fit(text, fp, maxw, start):
    s = start
    while s > 24 and font(fp, s).getlength(text) > maxw: s -= 4
    return s

def text_layer(text, fp, size, fill, shadow=True, pad=24):
    f = font(fp, size); w = int(f.getlength(text)); h = int(size * 1.35)
    im = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((pad, pad + 5), text, font=f, fill=(0, 0, 0, 150))
        im = Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(7)))
    ImageDraw.Draw(im).text((pad, pad), text, font=f, fill=fill)
    return im

def place(cv, layer, x, y, alpha=1.0):
    if alpha <= 0: return
    if alpha < 1:
        layer = layer.copy(); layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    cv.paste(layer, (int(x), int(y)), layer)

def scaled(layer, k):
    k = max(0.01, k); return layer.resize((max(1, int(layer.width * k)), max(1, int(layer.height * k))), Image.LANCZOS)

def probe_dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except Exception: return None

def load_pcm(path):
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True)
    return np.frombuffer(r.stdout, np.float32)

# ---------------------------------------------------------------- audio
SR = 44100
def synth_audio(total, scene_starts, voz=None):
    n = int(total * SR); t = np.arange(n) / SR; out = np.zeros(n, np.float32)
    bpm = 104; beat = 60 / bpm
    chords = [(220.0, 261.63, 329.63), (174.61, 220.0, 261.63), (261.63, 329.63, 392.0), (196.0, 246.94, 293.66)]
    bar = beat * 4
    for i, tt in enumerate(np.arange(0, total, bar)):
        ch = chords[i % 4]; a, b = int(tt * SR), min(n, int((tt + bar) * SR)); tl = t[a:b] - tt
        env = np.minimum(1, tl / 0.35) * np.minimum(1, (bar - tl) / 0.25)
        pad = sum(np.sin(2 * np.pi * f * tl) + 0.4 * np.sin(2 * np.pi * 2 * f * tl) for f in ch) / 3
        bass = np.sin(2 * np.pi * (ch[0] / 2) * tl) * np.exp(-tl * 0.8)
        out[a:b] += (0.10 * pad * env + 0.16 * bass).astype(np.float32)
    rng = np.random.default_rng(3)
    for k in range(int(total / beat)):
        s = int(k * beat * SR); L = int(0.16 * SR)
        if s + L >= n: break
        tl = np.arange(L) / SR
        out[s:s + L] += (0.28 * np.sin(2 * np.pi * (110 * np.exp(-tl * 18) + 42) * tl) * np.exp(-tl * 14)).astype(np.float32)
    for k in range(int(total / (beat / 2))):
        s = int(k * beat / 2 * SR); L = int(0.05 * SR)
        if s + L >= n: break
        nz = rng.standard_normal(L); nz = np.diff(nz, prepend=0)
        out[s:s + L] += (0.035 * nz * np.exp(-np.arange(L) / SR * 70)).astype(np.float32)
    # efeitos: whoosh a cada troca de cena e pop do numero
    for st in scene_starts:
        s = int(max(0, st - 0.12) * SR); L = int(0.55 * SR)
        if s + L >= n: continue
        tl = np.arange(L) / SR; nz = rng.standard_normal(L)
        k = np.convolve(nz, np.ones(24) / 24, mode="same")
        env = np.sin(np.pi * np.clip(tl / 0.55, 0, 1)) ** 2
        out[s:s + L] += (0.30 * k * env).astype(np.float32)
        s2 = int((st + 0.10) * SR); L2 = int(0.22 * SR)
        if s2 + L2 < n:
            t2 = np.arange(L2) / SR
            out[s2:s2 + L2] += (0.30 * np.sin(2 * np.pi * (900 * np.exp(-t2 * 10) + 180) * t2) * np.exp(-t2 * 16)).astype(np.float32)
    fi = np.minimum(1, t / 0.3); fo = np.minimum(1, (total - t) / 1.2)
    out *= fi * fo; out /= max(1e-6, np.abs(out).max()) / 0.55
    return out

def write_wav(path, sig):
    pcm = (np.clip(sig, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

# ---------------------------------------------------------------- video
# ---------------------------------------------------------------- ilustracoes (desenhadas em codigo, sem imagens de terceiros)
GREEN = (31, 122, 77); DARK = (0, 20, 50); SOFT = (235, 240, 250)
def _f(p, s): return ImageFont.truetype(p, int(s))

def draw_icon(kind, p, S=360):
    """Retorna camada RGBA SxS. p = progresso da animacao 0..1 (usado em 'barras')."""
    K = 2; N = S * K; im = Image.new("RGBA", (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    def R(x0, y0, x1, y1, r, fill, outline=None, w=0):
        d.rounded_rectangle([x0 * K, y0 * K, x1 * K, y1 * K], radius=r * K, fill=fill, outline=outline, width=w * K)
    if kind == "moedas":
        for i, (cx, cy) in enumerate(((120, 260), (240, 250), (180, 180), (180, 100))):
            d.ellipse([(cx - 80) * K, (cy - 28) * K, (cx + 80) * K, (cy + 28) * K], fill=(200, 160, 0), outline=DARK, width=4 * K)
            d.rectangle([(cx - 80) * K, cy * K, (cx + 80) * K, (cy + 26) * K], fill=(200, 160, 0))
            d.ellipse([(cx - 80) * K, (cy - 2) * K, (cx + 80) * K, (cy + 54) * K], fill=(200, 160, 0), outline=DARK, width=4 * K)
            d.ellipse([(cx - 80) * K, (cy - 28) * K, (cx + 80) * K, (cy + 28) * K], fill=YEL, outline=DARK, width=4 * K)
        t = _f(FD, 44 * K); d.text((180 * K, 100 * K), "R$", font=t, fill=DARK, anchor="mm")
    elif kind == "cartao":
        R(30, 80, 330, 270, 26, WHITE, DARK, 5); R(30, 110, 330, 150, 0, DARK)
        R(60, 180, 130, 225, 8, YEL, DARK, 3); d.line([(95 * K, 180 * K), (95 * K, 225 * K)], fill=DARK, width=3 * K)
        d.line([(60 * K, 202 * K), (130 * K, 202 * K)], fill=DARK, width=3 * K)
        for i in range(4): R(170 + i * 38, 232, 195 + i * 38, 246, 4, (150, 160, 180))
        t = _f(FD, 30 * K); d.text((300 * K, 195 * K), "R$", font=t, fill=GREEN, anchor="rm")
    elif kind == "calendario":
        R(40, 60, 320, 310, 28, WHITE, DARK, 5); R(40, 60, 320, 130, 28, YEL, DARK, 5); d.rectangle([42 * K, 100 * K, 318 * K, 130 * K], fill=YEL)
        for x in (110, 250): R(x - 8, 30, x + 8, 85, 8, DARK)
        for r_ in range(3):
            for c_ in range(5):
                x0 = 62 + c_ * 49; y0 = 150 + r_ * 50
                R(x0, y0, x0 + 34, y0 + 34, 6, SOFT if (r_, c_) != (1, 2) else GREEN)
    elif kind == "martelo":
        h = Image.new("RGBA", (N, N), (0, 0, 0, 0)); hd = ImageDraw.Draw(h)
        hd.rounded_rectangle([60 * K, 150 * K, 270 * K, 205 * K], radius=10 * K, fill=(120, 80, 40), outline=DARK, width=4 * K)
        hd.rounded_rectangle([220 * K, 100 * K, 300 * K, 255 * K], radius=14 * K, fill=YEL, outline=DARK, width=4 * K)
        h = h.rotate(35, resample=Image.BICUBIC, center=(180 * K, 180 * K)); im.alpha_composite(h)
        R(40, 285, 250, 315, 10, (120, 80, 40), DARK, 4)
    elif kind == "banco":
        d.polygon([(180 * K, 40 * K), (330 * K, 120 * K), (30 * K, 120 * K)], fill=YEL, outline=DARK, width=5 * K)
        for x in (60, 125, 190, 255): R(x, 135, x + 45, 270, 6, WHITE, DARK, 4)
        R(35, 275, 325, 310, 8, SOFT, DARK, 4)
        d.ellipse([140 * K, 62 * K, 220 * K, 108 * K], outline=DARK, width=0)
        t = _f(FD, 40 * K); d.text((180 * K, 98 * K), "R$", font=t, fill=DARK, anchor="mm")
    elif kind == "barras":
        k = ease(p)
        d.line([(30 * K, 320 * K), (340 * K, 320 * K)], fill=WHITE, width=4 * K)
        h1 = 250 * k; h2 = 25 * k
        R(60, 320 - h1, 160, 320, 10, (200, 80, 70), DARK, 4)
        R(220, 320 - max(h2, 4), 320, 320, 8, YEL, DARK, 4)
        t = _f(FD, 34 * K)
        d.text((110 * K, (300 - h1) * K), "R$ 90 bi", font=t, fill=WHITE, anchor="mm")
        d.text((270 * K, (300 - h2 - 6) * K), "R$ 9 bi", font=t, fill=YEL, anchor="mm")
    elif kind == "relogio":
        d.ellipse([40 * K, 40 * K, 320 * K, 320 * K], fill=WHITE, outline=DARK, width=6 * K)
        for a in range(12):
            r0 = 118 if a % 3 == 0 else 128; ang = math.radians(a * 30)
            d.line([((180 + r0 * math.sin(ang)) * K, (180 - r0 * math.cos(ang)) * K), ((180 + 138 * math.sin(ang)) * K, (180 - 138 * math.cos(ang)) * K)], fill=DARK, width=5 * K)
        ah = math.radians(360 * (0.1 + 0.9 * ease(p)) * 0.25 + 300); am = ah * 12
        d.line([(180 * K, 180 * K), ((180 + 70 * math.sin(ah)) * K, (180 - 70 * math.cos(ah)) * K)], fill=DARK, width=10 * K)
        d.line([(180 * K, 180 * K), ((180 + 105 * math.sin(am)) * K, (180 - 105 * math.cos(am)) * K)], fill=(200, 80, 70), width=7 * K)
        d.ellipse([168 * K, 168 * K, 192 * K, 192 * K], fill=YEL, outline=DARK, width=4 * K)
    elif kind == "alerta":
        d.polygon([(180 * K, 35 * K), (335 * K, 305 * K), (25 * K, 305 * K)], fill=YEL, outline=DARK, width=7 * K)
        R(165, 115, 195, 220, 12, DARK); d.ellipse([163 * K, 238 * K, 197 * K, 272 * K], fill=DARK)
    elif kind == "pessoas":
        for cx, cy, s_, col in ((95, 150, .8, (200, 160, 0)), (265, 150, .8, (200, 80, 70)), (180, 120, 1.0, YEL)):
            d.ellipse([(cx - 36 * s_) * K, (cy - 36 * s_ - 40) * K, (cx + 36 * s_) * K, (cy + 36 * s_ - 40) * K], fill=col, outline=DARK, width=5 * K)
            d.pieslice([(cx - 62 * s_) * K, (cy + 10 * s_) * K, (cx + 62 * s_) * K, (cy + 200 * s_) * K], 180, 360, fill=col, outline=DARK, width=5 * K)
        R(40, 300, 320, 320, 8, (150, 160, 180))
    elif kind == "documento":
        R(70, 30, 290, 330, 18, WHITE, DARK, 5); d.polygon([(230 * K, 30 * K), (290 * K, 90 * K), (230 * K, 90 * K)], fill=SOFT, outline=DARK)
        for i in range(5): R(100, 120 + i * 38, 260 - (i % 2) * 50, 134 + i * 38, 5, (150, 160, 180))
        R(100, 70, 180, 90, 5, DARK)
        d.ellipse([200 * K, 250 * K, 270 * K, 320 * K], fill=GREEN, outline=DARK, width=4 * K)
        d.line([(215 * K, 285 * K), (232 * K, 303 * K), (258 * K, 268 * K)], fill=WHITE, width=7 * K)
    elif kind == "grafico":
        k = ease(p); d.line([(30 * K, 320 * K), (340 * K, 320 * K)], fill=WHITE, width=4 * K); d.line([(30 * K, 40 * K), (30 * K, 320 * K)], fill=WHITE, width=4 * K)
        pts = [(50, 290), (120, 230), (180, 250), (250, 150), (320, 70)]; n_ = len(pts) - 1; pos = k * n_; seg = []
        for i in range(n_ + 1):
            if i <= pos: seg.append(pts[i])
            elif i - 1 < pos:
                f_ = pos - (i - 1); a, b = pts[i - 1], pts[i]; seg.append((a[0] + (b[0] - a[0]) * f_, a[1] + (b[1] - a[1]) * f_))
        if len(seg) > 1: d.line([(x * K, y * K) for x, y in seg], fill=YEL, width=10 * K, joint="curve")
        for x, y in seg: d.ellipse([(x - 11) * K, (y - 11) * K, (x + 11) * K, (y + 11) * K], fill=WHITE, outline=DARK, width=4 * K)
    elif kind == "pin":
        d.ellipse([60 * K, 30 * K, 300 * K, 270 * K], fill=(200, 80, 70), outline=DARK, width=6 * K)
        d.polygon([(95 * K, 215 * K), (265 * K, 215 * K), (180 * K, 335 * K)], fill=(200, 80, 70), outline=DARK)
        d.rectangle([97 * K, 205 * K, 263 * K, 222 * K], fill=(200, 80, 70)); d.ellipse([130 * K, 100 * K, 230 * K, 200 * K], fill=WHITE, outline=DARK, width=5 * K)
    elif kind == "megafone":
        d.polygon([(70 * K, 140 * K), (250 * K, 50 * K), (250 * K, 310 * K), (70 * K, 220 * K)], fill=YEL, outline=DARK, width=6 * K)
        R(30, 140, 100, 220, 14, WHITE, DARK, 5); R(105, 215, 160, 300, 12, (120, 80, 40), DARK, 5)
        for i, r_ in enumerate((40, 80, 120)): d.arc([(260 - r_) * K, (180 - r_) * K, (270 + r_) * K, (180 + r_) * K], -40, 40, fill=WHITE, width=7 * K)
    elif kind == "escudo":
        d.polygon([(180 * K, 30 * K), (320 * K, 80 * K), (310 * K, 210 * K), (180 * K, 335 * K), (50 * K, 210 * K), (40 * K, 80 * K)], fill=(30, 90, 170), outline=DARK, width=7 * K)
        d.line([(110 * K, 185 * K), (165 * K, 240 * K), (255 * K, 120 * K)], fill=YEL, width=24 * K, joint="curve")
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); sh.paste((0, 0, 0, 120), mask=im.getchannel("A"))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0)); out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)), (0, 14 * K)); out.alpha_composite(im)
    return out.resize((S, S), Image.LANCZOS)

SERIF = os.path.join(ASSETS, "fonts", "Lora-Italic-Variable.ttf")
BLUE = (30, 90, 200); INK = (18, 20, 28); PAPER = (236, 229, 214); BLACK = (7, 10, 18)
rng = np.random.RandomState(7)
NOISE = rng.randint(-9, 10, (H // 2, W // 2, 1)).astype(np.int16)

def bg(kind, t):
    if kind == "paper": base = np.full((H, W, 3), PAPER, np.int16)
    elif kind == "navy": base = np.full((H, W, 3), (4, 24, 58), np.int16)
    else: base = np.full((H, W, 3), BLACK, np.int16)
    nz = np.roll(NOISE, int(t * 30) % 40, axis=0).repeat(2, 0).repeat(2, 1)
    base = base + nz * (1 if kind == "paper" else 1)
    if kind != "paper":
        base[::4] += 5  # scanlines
        yy = np.linspace(-1, 1, H)[:, None, None]; xx = np.linspace(-1, 1, W)[None, :, None]
        base = (base * (1 - 0.35 * (yy ** 2 + xx ** 2) / 2)).astype(np.int16)
    else:
        base[::90] -= 6; base[:, ::90] -= 6  # grade de papel
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))

def wrap(words, f, maxw):
    lines, cur = [], []
    for w in words:
        if cur and f.getlength(" ".join(cur + [w])) > maxw: lines.append(cur); cur = [w]
        else: cur.append(w)
    if cur: lines.append(cur)
    return lines

def tagbox(text, size=40):
    f = font(FD, size); w = int(f.getlength(text.upper())) + 56; h = int(size * 1.9)
    im = Image.new("RGBA", (w, h), BLUE + (255,)); ImageDraw.Draw(im).text((28, h // 2), text.upper(), font=f, fill=WHITE, anchor="lm")
    return im

def rings(cv, cx, cy, t, col):
    d = ImageDraw.Draw(cv, "RGBA")
    for i in range(4):
        r = ((t * 260 + i * 130) % 520) + 40; a = int(160 * (1 - r / 560))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col + (max(a, 0),), width=4)

def brackets(cv, box, col, k):
    x0, y0, x1, y1 = box; L = int(70 * k); d = ImageDraw.Draw(cv)
    for (x, y, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        d.line([(x, y), (x + sx * L, y)], fill=col, width=8); d.line([(x, y), (x, y + sy * L)], fill=col, width=8)

class V:
    def __init__(self, c):
        self.c = c; self.b = c["beats"]; base = c["_dir"]; self.durs = []; self.voz = []
        for bt in self.b:
            p = os.path.join(base, bt["voz"]) if bt.get("voz") else None
            d = probe_dur(p) if p and os.path.exists(p) else None
            self.voz.append(p if d else None)
            self.durs.append((d + 0.32) if d else 0.38 * len(bt["txt"].split()) + 0.6)
        self.starts = [sum(self.durs[:i]) for i in range(len(self.b))]
        self.OUT = 2.6; self.total = sum(self.durs) + self.OUT
        novo = os.path.join(ASSETS, "giro-logo-oficial.png")
        if os.path.exists(novo):
            # Logo oficial em alta qualidade, ja com fundo transparente (nao recortar em circulo: o nome vaza do circulo).
            self.selo = Image.open(novo).convert("RGBA")
        else:
            lg = Image.open(os.path.join(ASSETS, "logo-oficial.webp")).convert("RGBA"); m = Image.new("L", lg.size, 0)
            ImageDraw.Draw(m).ellipse([1, 1, lg.width - 2, lg.height - 2], fill=255); lg.putalpha(m); self.selo = lg
        self.icons = {}
        self.photo = c.get("photo"); self.photo_credit = c.get("photo_credit") or ""
    def icon(self, k, p):
        return draw_icon(k, p, 360).resize((520, 520), Image.LANCZOS)

    def cover(self):
        """Capa/thumb: quadro mostrado nos primeiros frames (e salvo como PNG). Manchete completa, grande e dentro das margens seguras."""
        bt0 = self.b[0]; head = re.sub(r"\s+", " ", str(self.c.get("title") or bt0["txt"]).split("|")[0]).strip().upper(); words = head.split()
        if self.photo is not None:
            cv = self.photo_bg({"pidx": 0}, 0, 1)
            sh = Image.new("RGBA", (W, H), (1, 10, 24, 0)); ImageDraw.Draw(sh).rectangle([0, 520, W, 1500], fill=(1, 10, 24, 120)); cv.alpha_composite(sh)
        else:
            cv = bg("navy", 0).convert("RGBA")
            g = np.zeros((H, W, 4), np.uint8); g[..., 2] = 40; g[..., 3] = (np.linspace(0, 1, H)[:, None] * 70).astype(np.uint8).repeat(W, 1)
            cv.alpha_composite(Image.fromarray(g, "RGBA"))
        d = ImageDraw.Draw(cv, "RGBA")
        size = 168
        while size > 72:
            f = font(FD, size); lines = wrap(words, f, 940)
            if len(lines) <= 5 and all(f.getlength(w) <= 940 for w in words): break
            size -= 6
        f = font(FD, size); lh = int(size * 1.08); hi = (bt0.get("hi") or "").upper()
        IMPACT = re.compile(r"^(MORT[OA]S?|FERID[OA]S?|PRES[OA]S?|\d[\d.,]*%?|R\$|BILH|MILH|ALERTA|URGENTE|EXPLOS|ATAQUE|CRISE|RECORDE|GUERRA|TIRO|TEMPORAL)")
        hits = [i for i, w in enumerate(words) if IMPACT.match(re.sub(r"[^\wÀ-Ú$%.,]", "", w))]
        hi_i = hits[0] if hits else (max(range(len(words)), key=lambda i: len(re.sub(r"\W", "", words[i]))) if words else 0)
        y0 = 940 - len(lines) * lh // 2; idx = 0
        for li, line in enumerate(lines):
            x = 70
            for w in line:
                col = YEL if (idx == hi_i or (idx == hi_i + 1 and re.match(r"^[\d.,%]+$", re.sub(r"[^\w.,%]", "", words[hi_i])))) else WHITE
                d.text((x, y0 + li * lh), w, font=f, fill=col, stroke_width=max(4, size // 28), stroke_fill=(1, 7, 18))
                x += f.getlength(w + " "); idx += 1
        d.rectangle([70, y0 + len(lines) * lh + 18, 70 + 360, y0 + len(lines) * lh + 34], fill=YEL)
        tag = bt0.get("tag") or self.c.get("tag") or "Giro Madeira"
        tb = tagbox(str(tag), 48); cv.alpha_composite(tb, (70, y0 - 150))
        big = self.selo.resize((260, 260), Image.LANCZOS); cv.alpha_composite(big, (50, 110))
        bar = Image.new("RGBA", (W, 150), (253, 220, 1, 255)); cv.alpha_composite(bar, (0, 1560))
        ImageDraw.Draw(cv).text((W // 2, 1635), "@GIRO_MADEIRA  \u00b7  NOT\u00cdCIAS", font=font(FD, 58), fill=(1, 29, 65), anchor="mm")
        return cv.convert("RGB")

    def frame(self, t):
        if t < COVER_T: return self.cover()
        if t >= self.total - self.OUT: return self.outro(t - (self.total - self.OUT))
        i = max(j for j, s in enumerate(self.starts) if s <= t); bt = self.b[i]; lt = t - self.starts[i]; dur = self.durs[i]
        dark = bt.get("bg", "paper") != "paper"; fg = WHITE if dark else INK
        hasimg = bt["kind"] == "photo" and (bt.get("img") is not None or self.photo is not None)
        if hasimg: dark = True; fg = WHITE
        cv = (self.photo_bg(bt, lt, dur) if hasimg else bg(bt.get("bg", "paper"), t).convert("RGBA"))
        if bt["kind"] == "photo" and not hasimg: bt = dict(bt, kind="serif", bg="dark")
        getattr(self, "k_" + bt["kind"])(cv, bt, lt, dur, fg, dark)
        # molduras fixas
        d = ImageDraw.Draw(cv)
        d.rectangle([0, 0, W, 10], fill=(0, 0, 0, 40)); d.rectangle([0, 0, W * t / self.total, 10], fill=YEL)
        mini = self.selo.resize((150, 150), Image.LANCZOS); cv.alpha_composite(mini, (34, 36))
        if self.c.get("teste"):
            f = font(FD, 24); d.rounded_rectangle([W - 330, 60, W - 40, 112], 12, fill=(0, 0, 0, 150)); d.text((W - 185, 86), "PRÉVIA DE TESTE", font=f, fill=WHITE, anchor="mm")
        if i >= len(self.b) - 3:
            f = font(FM, 30); d.text((W // 2, H - 90), "Fonte: " + self.c["fonte"], font=f, fill=fg, anchor="mm")
        # corte com flash
        if lt < 0.08: cv = Image.blend(cv, Image.new("RGBA", cv.size, (255, 255, 255, 255)), 0.35 * (1 - lt / 0.08))
        return cv.convert("RGB")

    # ---- cenas
    def k_type(self, cv, bt, lt, dur, fg, dark):
        words = bt["txt"].split(); f = font(FD, 128); lines = wrap(words, f, 940); d = ImageDraw.Draw(cv, "RGBA")
        txt = " ".join(" ".join(l) for l in lines); n = int(min(len(txt), lt * 38)); shown = 0
        y0 = H // 2 - len(lines) * 76 - 40; hi = (bt.get("hi") or "").lower()
        for li, line in enumerate(lines):
            x = 70; y = y0 + li * 150
            for w in line:
                vis = txt[shown:shown + len(w)] if shown < n else ""
                wfull = f.getlength(w + " ")
                if hi and re.sub(r"\W", "", w.lower()) == hi and n >= shown + len(w) and lt > 0.4:
                    k = ease((lt - 0.4) / 0.25); d.rectangle([x - 8, y + 12, x - 8 + (f.getlength(w) + 16) * k, y + 136], fill=BLUE + (255,)); col = WHITE
                else: col = fg
                if vis: d.text((x, y), vis[: max(0, n - shown)], font=f, fill=col)
                if shown <= n < shown + len(w) + 1 and lt < dur - 0.2 and int(lt * 3) % 2 == 0:
                    cx = x + f.getlength(w[: max(0, n - shown)]); d.rectangle([cx + 4, y + 14, cx + 16, y + 132], fill=YEL if dark else BLUE)
                x += wfull; shown += len(w) + 1
        if bt.get("tag"):
            tb = tagbox(bt["tag"]); k = back((lt - 0.15) / 0.3); cv.alpha_composite(scaled(tb, k), (70, y0 - 130))

    def photo_bg(self, bt, lt, dur):
        """Foto do fato em tela cheia: zoom lento (Ken Burns), gradiente azul-marinho para leitura."""
        im = bt.get("img") if bt.get("img") is not None else self.photo; k = 1.0 + 0.10 * clamp(lt / max(dur, 0.1)); idx = bt.get("pidx", 0)
        sc = max(W / im.width, H / im.height) * k; w, h = int(im.width * sc), int(im.height * sc)
        r = im.resize((w, h), Image.LANCZOS); px = [.35, .5, .65][idx % 3]
        x = int((w - W) * px); y = int((h - H) * .45); cv = r.crop((x, y, x + W, y + H)).convert("RGBA")
        g = np.zeros((H, W, 4), np.uint8); yy = np.linspace(0, 1, H)[:, None]
        g[..., 0] = 1; g[..., 1] = 10; g[..., 2] = 24; g[..., 3] = (np.clip(0.18 + 0.78 * np.clip((yy - 0.35) / 0.55, 0, 1) ** 1.2, 0, 0.95) * 255).astype(np.uint8)[:, :1].repeat(W, 1)
        cv.alpha_composite(Image.fromarray(g, "RGBA")); return cv

    def k_photo(self, cv, bt, lt, dur, fg, dark):
        d = ImageDraw.Draw(cv, "RGBA"); words = bt["txt"].split(); f = font(FD, 84); lines = wrap(words, f, 940)
        txt = " ".join(" ".join(l) for l in lines); n = int(min(len(txt), max(0, lt - 0.1) * 46)); shown = 0
        y0 = 1260 - (len(lines) - 1) * 50
        if bt.get("tag"):
            tb = tagbox(bt["tag"], 38); cv.alpha_composite(scaled(tb, back((lt - 0.1) / 0.3)), (70, y0 - 110))
        for li, line in enumerate(lines):
            x = 70; y = y0 + li * 102
            for w in line:
                vis = txt[shown:shown + len(w)] if shown < n else ""; vis = vis[: max(0, n - shown)]
                if vis: d.text((x, y), vis, font=f, fill=YEL if li == len(lines) - 1 and len(lines) > 1 else WHITE, stroke_width=3, stroke_fill=(1, 7, 18))
                x += f.getlength(w + " "); shown += len(w) + 1
        lab_src = ("" if bt.get("img_credit") == "Giro Madeira" else ("Imagem gerada por IA, ilustrativa" if bt.get("img_ai") else "Imagem ilustrativa: " + bt["img_credit"]) if bt.get("img_credit") else (("Foto: " + self.photo_credit) if self.photo_credit else ""))
        if lab_src:
            cf = font(FM, 26); lab = lab_src; d.text((W - 50 - cf.getlength(lab), H - 200), lab, font=cf, fill=WHITE, stroke_width=2, stroke_fill=(0, 5, 14))

    def k_serif(self, cv, bt, lt, dur, fg, dark):
        words = bt["txt"].split(); f = font(SERIF, 110); f.set_variation_by_axes([700]) if hasattr(f, "set_variation_by_axes") else None
        lines = wrap(words, f, 900); d = ImageDraw.Draw(cv, "RGBA"); idx = 0; tot = len(words)
        per = max(0.18, min(0.42, (dur - 0.5) / tot)); y0 = H // 2 - len(lines) * 70
        for li, line in enumerate(lines):
            tw = sum(f.getlength(w + " ") for w in line) - f.getlength(" "); x = (W - tw) / 2; y = y0 + li * 140
            for w in line:
                a = ease((lt - idx * per) / 0.2)
                if a > 0:
                    col = YEL if idx == tot - 1 else fg
                    lay = Image.new("RGBA", (int(f.getlength(w)) + 40, 170), (0, 0, 0, 0)); ImageDraw.Draw(lay).text((20, 10), w, font=f, fill=col)
                    lay.putalpha(lay.getchannel("A").point(lambda v: int(v * a))); cv.alpha_composite(lay, (int(x - 20), int(y - 10 + (1 - a) * 24)))
                x += f.getlength(w + " "); idx += 1
        # rabisco: sublinhado
        if lt > 0.6:
            k = ease((lt - 0.6) / 0.4); ww = 560 * k; d.line([(W // 2 - 280, y0 + len(lines) * 140 + 30), (W // 2 - 280 + ww, y0 + len(lines) * 140 + 18)], fill=YEL, width=8)

    def k_num(self, cv, bt, lt, dur, fg, dark):
        cx, cy = W // 2, 600; rings(cv, cx, cy, lt, YEL if dark else BLUE)
        ic = self.icon(bt["icone"], clamp(lt / 1.2)); k = back(lt / 0.4); cv.alpha_composite(scaled(ic, 0.62 * k), (cx - int(ic.width * 0.31 * k), cy - int(ic.height * 0.31 * k)))
        big = bt["big"].upper(); sz = fit(big, FD, 960, 230); f = font(FD, sz); lay = Image.new("RGBA", (int(f.getlength(big)) + 80, int(sz * 1.4)), (0, 0, 0, 0))
        ImageDraw.Draw(lay).text((40, 20), big, font=f, fill=YEL if dark else INK)
        k2 = back((lt - 0.2) / 0.45); sl = scaled(lay, k2); cv.alpha_composite(sl, (W // 2 - sl.width // 2, 1000 - sl.height // 2))
        if bt.get("tag"):
            tb = tagbox(bt["tag"], 44); k3 = back((lt - 0.45) / 0.3); sl = scaled(tb, k3); cv.alpha_composite(sl, (W // 2 - sl.width // 2, 1150))
        self.caption(cv, bt, lt, fg, 1330)

    def k_icon(self, cv, bt, lt, dur, fg, dark):
        cx, cy = W // 2, 740; k = back(lt / 0.45); ic = self.icon(bt["icone"], clamp(lt / 1.2))
        brackets(cv, (cx - 360, cy - 360, cx + 360, cy + 360), YEL if dark else BLUE, ease(lt / 0.3))
        cv.alpha_composite(scaled(ic, 1.1 * k), (cx - int(ic.width * 0.55 * k), cy - int(ic.height * 0.55 * k)))
        if bt.get("tag"):
            tb = tagbox(bt["tag"], 44); sl = scaled(tb, back((lt - 0.3) / 0.3)); cv.alpha_composite(sl, (cx - sl.width // 2, cy + 400))
        self.caption(cv, bt, lt, fg, 1330)

    def caption(self, cv, bt, lt, fg, y):
        words = bt["txt"].split(); f = font(FB, 56); lines = wrap(words, f, 900); d = ImageDraw.Draw(cv)
        n = int(min(len(bt["txt"]), max(0, lt - 0.3) * 60)); shown = 0
        for li, line in enumerate(lines):
            s = " ".join(line); vis = bt["txt"][shown:shown + len(s)] if shown < n else ""
            vis = vis[: max(0, n - shown)]; d.text((W // 2, y + li * 76), vis, font=f, fill=fg, anchor="mm") if False else d.text(((W - f.getlength(s)) / 2, y + li * 76), vis, font=f, fill=fg)
            shown += len(s) + 1

    def outro(self, t):
        cv = bg("navy", t).convert("RGBA"); rings(cv, W // 2, 820, t, YEL)
        k = back(t / 0.5); s = self.selo.resize((380, 380), Image.LANCZOS); cv.alpha_composite(scaled(s, k), (W // 2 - int(190 * k), 820 - int(190 * k)))
        d = ImageDraw.Draw(cv); f = font(FD, 64); a = ease((t - 0.4) / 0.4)
        d.text((W // 2, 1200), "@GIRO_MADEIRA", font=f, fill=YEL + (int(255 * a),) if False else YEL, anchor="mm")
        d.text((W // 2, 1290), "Porto Velho · Rondônia · Brasil · Mundo", font=font(FM, 36), fill=WHITE, anchor="mm")
        return cv.convert("RGB")


def audio(v, cfg):
    music = synth_audio(v.total, v.starts) * 0.22; vt = np.zeros_like(music)
    for i, p in enumerate(v.voz):
        if p: x = load_pcm(p); a = int((v.starts[i] + 0.12) * SR); b = min(len(vt), a + len(x)); vt[a:b] += x[:b - a]
    if vt.any(): vt /= max(1e-6, np.abs(vt).max()) / 0.9
    m = music + vt; sd = cfg.get("sfx_dir") or os.path.join(ASSETS, "sfx")
    def mix(n, at, g):
        p = os.path.join(sd, n + ".wav")
        if not os.path.exists(p): return
        x = load_pcm(p) * g; a = int(at * SR)
        if a < len(m): b = min(len(m), a + len(x)); m[a:b] += x[:b - a]
    for i, bt in enumerate(v.b):
        st = v.starts[i]; mix("impacto_seco" if i == 0 else "transicao_swoosh_curto", st, 0.5)
        if bt["kind"] == "type":
            mix("digitacao_teclas", st + 0.05, 0.35)
            if bt.get("hi"): mix("ding_destaque", st + 0.55, 0.25)
        if bt["kind"] in ("num", "icon"): mix("pop", st + 0.12, 0.5); mix("tique_numero", st + 0.35, 0.4)
        if bt["kind"] == "serif": mix("clique", st + 0.2, 0.3)
    mix("whoosh_grave", v.total - v.OUT - 0.05, 0.5); mix("sino_noticia", v.total - v.OUT + 0.3, 0.4)
    return m / max(1.0, np.abs(m).max())

def render_video(cfg, out):
    """cfg: tag, fonte, teste(bool), beats[...]. Renderiza MP4 1080x1920, 30 fps, AAC; devolve duracao."""
    cfg.setdefault("_dir", "."); v = V(cfg); m = audio(v, cfg); wp = str(out) + ".wav"; write_wav(wp, m)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-", "-i", wp,
           "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try: v.cover().save(str(out) + ".cover.png")
    except Exception as e: print("capa nao salva:", e)
    for i in range(int(v.total * FPS)): p.stdin.write(v.frame(i / FPS).tobytes())
    p.stdin.close()
    if p.wait() != 0: raise RuntimeError("ffmpeg falhou no render motion")
    os.remove(wp); return v.total

# ---------------------------------------------------------------- roteiro -> beats
FIG = re.compile(r"(R\$\s*[\d.,]+\s*(?:bilh[õo]es|bilh[ãa]o|milh[õo]es|milh[ãa]o|bi|mi|mil)?|\d+[\d.,]*\s*%|\b\d+[\d.,]*\s*(?:mil|milh[õo]es|bilh[õo]es|anos|dias|horas|mortos|feridos|pessoas|vagas|presos)\b)", re.I)
ICON_WORDS = [  # (icone, palavras) - so icones que nao afirmam algo falso
    ("moedas", r"R\$|reais|d[ií]vida|d[ée]bito|pre[çc]o|sal[aá]rio|imposto|economia|juros|cr[ée]dito"),
    ("documento", r"resolu[çc][ãa]o|decreto|lei\b|portaria|projeto de lei|processo|contrato|di[aá]rio oficial|edital"),
    ("pessoas", r"eleitores|popula[çc][ãa]o|moradores|pessoas|candidatos|alunos|servidores|v[ií]timas"),
    ("megafone", r"anunci|divulg|declar|afirm|diz que|disse|informou|comunicad"),
    ("relogio", r"prazo|horas|hor[aá]rio|termina|come[çc]a|at[ée] \d|hoje|amanh[ãa]|domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[aá]bado"),
    ("pin", r"Porto Velho|Rond[ôo]nia|cidade|bairro|munic[ií]pio|regi[ãa]o|estado|BR-\d+"),
    ("grafico", r"alta\b|aumento|cresc|sobe|subiu|avan[çc]"),
    ("alerta", r"alerta|perigo|proib|apreens|pres[oa]|acidente|mortos|feridos|crime|fals|risco|emerg[êe]ncia|chuva|temporal|inc[êe]ndio|opera[çc][ãa]o"),
]
CAT_ICON = {"SEGURANÇA": "alerta", "ECONOMIA": "moedas", "POLÍTICA": "megafone", "TRÂNSITO": "alerta", "MUNDO": "pin", "SAÚDE": "alerta"}

def pick_icon(text, category):
    for ic, rx in ICON_WORDS:
        if re.search(rx, text, re.I): return ic
    return CAT_ICON.get((category or "").upper(), "documento")

def split_phrases(title, scenes):
    """Divide a pauta verificada em frases curtas (uma por corte). Nao inventa nem corta palavras."""
    raw = [str(title).split("|")[0]] + [str(x) for x in scenes]
    out = []
    for r in raw:
        r = re.sub(r"\s+", " ", r).strip()
        if not r: continue
        parts = re.split(r"(?<=[.!?;:])\s+", r)
        for part in parts:
            words = part.split()
            while len(words) > 9:  # quebra em virgula/conjuncao perto do meio
                cut = next((i for i in range(5, 9) if words[i - 1].endswith(",")), 7)
                out.append(" ".join(words[:cut])); words = words[cut:]
            if words: out.append(" ".join(words))
    return [x for x in out if len(x.split()) >= 2] or out

def build_beats(title, scenes, category="", has_photo=False):
    ph = split_phrases(title, scenes); beats = []; bgs = ["paper", "dark", "navy", "dark"]; used_big = 0; pidx = 0
    for i, t in enumerate(ph):
        fig = FIG.search(t); icon = pick_icon(t, category)
        if i == 0: kind = "type"
        elif has_photo and i % 2 == 1: kind = "photo"
        elif fig and used_big < 3: kind = "num"; used_big += 1
        elif i % 3 == 1: kind = "serif"
        elif i % 3 == 2: kind = "icon"
        else: kind = "type"
        b = {"txt": t, "kind": kind, "bg": "paper" if kind == "type" else ("navy" if (kind == "serif" and i % 2) else "dark" if kind == "serif" else bgs[i % 4])}
        if kind == "type":
            longest = max((w for w in re.sub(r"[^\wÀ-ú ]", "", t).split()), key=len, default="")
            b["hi"] = longest
            if i == 0: b["tag"] = category.title() if category else "Giro Madeira"
        if kind == "num":
            big = re.sub(r"\s+", " ", fig.group(1)).strip()
            b.update(big=big, icone=icon, tag=(category.title() if category else "Dado"))
        if kind == "photo": b.update(pidx=pidx, bg="dark"); pidx += 1
        if kind == "icon": b.update(icone=icon, tag=(category.title() if category else "Giro Madeira"))
        beats.append(b)
    return beats

def photo_credit_label(credit):
    """Rotulo curto e verdadeiro a partir do credito auditavel (Commons ou arquivo autorizado)."""
    parts = [x.strip() for x in str(credit).split(" — ")]
    if str(credit).startswith("wikimedia_event_") and len(parts) >= 3:
        return "%s / Wikimedia Commons (%s)" % (parts[1][:50], parts[2][:20])
    if str(credit).startswith("registered_event_"):
        return (parts[1] if len(parts) > 1 else "arquivo autorizado")[:70]
    return ""
