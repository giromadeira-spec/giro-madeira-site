"""Narração gratuita (Kokoro, Apache 2.0, voz pt-BR pm_santa) para os Shorts do Giro Madeira.

Falha com segurança: qualquer problema devolve None e o vídeo segue só com a trilha original.
Usa somente o texto já verificado da pauta; não inventa nada.
"""
import re, wave
from pathlib import Path

SR = 24000          # Kokoro e a trilha de make_music() usam 24 kHz
VOICE = "pm_santa"
MAX_SCENE_SECONDS = 8.2   # cada cena do vídeo dura 9 s (fade de saída em 8,65 s)


def spoken(text):
    """Normaliza valores para a fala (R$ 90 bi -> 90 bilhões de reais)."""
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    units = {"bi": "bilhões", "mi": "milhões", "mil": "mil", "milhões": "milhões",
             "milhão": "milhão", "bilhões": "bilhões", "bilhão": "bilhão"}
    def money(m):
        n, u = m.group(1), (m.group(2) or "").lower()
        if not u:
            return n + " reais"
        return n + " " + units[u] + (" de reais" if u != "mil" else " reais")
    t = re.sub(r"R\$\s*([\d.,]+)\s*(bilhões|bilhão|milhões|milhão|bi|mi|mil)?\b", money, t, flags=re.I)
    t = t.replace("%", " por cento").replace("&", " e ")
    t = re.sub(r"\bBR-(\d+)", r"BR \1", t)
    return t


def _write_wav(path, samples):
    import numpy as np
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes(pcm.tobytes())


def narrate(texts, folder, voice=VOICE):
    """Uma narração por cena. Devolve lista de Paths ou None se algo falhar/estourar o tempo."""
    try:
        import numpy as np
        from kokoro import KPipeline
        pipe = KPipeline(lang_code="p")
        out = []
        for i, text in enumerate(texts):
            line = spoken(text)
            if not line:
                out.append(None); continue
            audio = None
            for speed in (1.0, 1.12, 1.25):
                parts = [np.asarray(a, dtype="float32") for _, _, a in pipe(line, voice=voice, speed=speed) if a is not None]
                if not parts:
                    raise RuntimeError("Kokoro sem áudio")
                audio = np.concatenate(parts)
                if len(audio) / SR <= MAX_SCENE_SECONDS:
                    break
            if len(audio) / SR > MAX_SCENE_SECONDS:
                print("Narração da cena %d longa demais (%.1fs); vídeo seguirá sem voz." % (i, len(audio) / SR))
                return None
            path = Path(folder) / ("voz%d.wav" % i)
            _write_wav(path, audio)
            out.append(path)
        return out
    except Exception as exc:  # voz é um extra: nunca derruba a produção
        print("Narração indisponível, seguindo só com trilha:", type(exc).__name__, str(exc)[:120])
        return None


def mix_into_music(music_path, voices, out_path, scene_seconds=9.0, offset=0.55):
    """Mistura as vozes (início de cada cena + offset) sobre a trilha reduzida. Devolve out_path."""
    import numpy as np
    with wave.open(str(music_path), "rb") as f:
        assert f.getframerate() == SR and f.getnchannels() == 1 and f.getsampwidth() == 2
        music = np.frombuffer(f.readframes(f.getnframes()), dtype="<i2").astype("float32") / 32768.0
    mix = music * 0.28
    for i, vp in enumerate(voices):
        if not vp:
            continue
        with wave.open(str(vp), "rb") as f:
            v = np.frombuffer(f.readframes(f.getnframes()), dtype="<i2").astype("float32") / 32768.0
        v = v / max(1e-6, float(np.abs(v).max())) * 0.9
        a = int((i * scene_seconds + offset) * SR)
        b = min(len(mix), a + len(v))
        if b > a:
            mix[a:b] += v[: b - a]
    mix = mix / max(1.0, float(np.abs(mix).max()))
    _write_wav(out_path, mix)
    return out_path
