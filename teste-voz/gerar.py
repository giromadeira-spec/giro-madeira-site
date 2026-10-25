import sys, wave, numpy as np
from huggingface_hub import snapshot_download
from supertonic import TTS
REV = "724fb5abbf5502583fb520898d45929e62f02c0b"  # revisão fixa usada pelo VoiceStudio
path = snapshot_download(repo_id="Supertone/supertonic-3", revision=REV)
tts = TTS(model="supertonic-3", model_dir=path, auto_download=False)
texto = ("Por que a Madeira-Mamoré ficou conhecida como Ferrovia do Diabo? "
         "Porque a obra, no meio da floresta, foi marcada por doenças e por muitas mortes entre os trabalhadores.")
for voz in ["M1", "M3", "M4", "M5", "F3", "F4", "F5"]:
    style = tts.get_voice_style(voice_name=voz)
    wav, _ = tts.synthesize(text=texto, voice_style=style, total_steps=8, speed=1.0, lang="pt")
    a = np.clip(np.asarray(wav, dtype=np.float32).squeeze(), -1, 1)
    sr = int(getattr(tts, "sample_rate", 44100))
    with wave.open(f"teste-voz/saida/supertonic_{voz}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((a * 32767).astype(np.int16).tobytes())
    print("ok", voz, len(a) / sr, "s")
