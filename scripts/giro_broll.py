#!/usr/bin/env python3
"""Imagens ilustrativas (b-roll) por palavra-chave para os videos do Giro Madeira.

Regras (decididas pelo Gilson em 23/10/2026):
- Somente imagens com licenca aberta que permite uso comercial: CC0, dominio publico e CC BY (com credito).
  Nunca CC BY-SA/NC/ND. Nada do Pinterest, Google Imagens ou qualquer fonte sem licenca.
- Sempre rotuladas como IMAGEM ILUSTRATIVA, com autor e licenca no credito.
- Nao usar em tragedia/crime/violencia (a foto pareceria a cena real) nem para pessoas (direito de imagem).
- Qualquer falha devolve vazio e o video segue como antes (icones/ilustracao).
Fontes sem chave: Openverse e Wikimedia Commons."""
import io, re, sys, json, unicodedata, urllib.parse
import requests
from PIL import Image

UA = {"User-Agent": "GiroMadeiraBot/1.0 (jornal digital Porto Velho; contato giromadeira@gmail.com)"}
OK_LIC = {"cc0", "pdm", "by"}            # Openverse
MAX_PER_VIDEO = 3
TRAGEDY = re.compile(r"morr|mort|ferid|assassin|homic|crime|preso|prisao|policia|tiro|ataque|atentado|explos|estupr|abus|acidente|vitima|tragedia|guerra|bomb|sequestr|trafico|operacao|massacre|suicid|desaparec|afog|incendi", re.I)
PERSON = re.compile(r"\b(presidente|ministr[oa]|senador[a]?|deputad[oa]|governador[a]?|prefeit[oa]|juiz[a]?|candidat[oa]|lula|bolsonaro|trump|biden|putin|netanyahu|xi jinping)\b", re.I)

# (regex em PT sem acento, consulta em ingles)
KEYWORDS = [
    (r"\b(estrada|rodovia|br-\d+|asfalto|pista)\b", "highway road|road|highway|street"),
    (r"\b(aviao|aeronave|aeroporto|voo|voos|companhia aerea)\b", "airplane flying sky|airplane|aircraft|jet|airliner"),
    (r"\b(foguete|lancamento espacial|satelite|espaco|nasa|astronauta)\b", "rocket launch|rocket|launch"),
    (r"\b(carro|carros|veiculo|veiculos|automovel|automoveis|montadora)\b", "car on road|car|automobile|sedan|vehicle"),
    (r"\b(onibus|transporte publico)\b", "city bus|bus"),
    (r"\b(caminhao|caminhoes|carga|frete)\b", "truck on highway|truck|lorry"),
    (r"\b(navio|barco|porto|balsa|embarcacao)\b", "cargo ship|ship|vessel|boat|port"),
    (r"\b(trem|ferrovia|locomotiva)\b", "train railway|train|railway|locomotive"),
    (r"\b(hospital|saude|sus|vacina|vacinacao|medico|medicos)\b", "hospital building|hospital|clinic|ambulance"),
    (r"\b(dinheiro|economia|inflacao|juros|salario|reais|bilhoes|milhoes|imposto|banco)\b", "brazilian real banknotes|banknote|banknotes|money|currency|real"),
    (r"\b(chuva|chuvas|temporal|tempestade|previsao do tempo)\b", "heavy rain storm clouds|rain|storm|thunderstorm|clouds"),
    (r"\b(seca|calor|temperatura|onda de calor)\b", "drought dry land|drought|dry|cracked"),
    (r"\b(queimada|queimadas|fogo|floresta|desmatamento|amazonia)\b", "amazon rainforest|rainforest|amazon|forest"),
    (r"\b(rio madeira|rio|enchente|cheia)\b", "river landscape|river"),
    (r"\b(ponte)\b", "bridge|bridge"),
    (r"\b(escola|alunos|estudantes|educacao|enem|universidade)\b", "school classroom|classroom|school|students"),
    (r"\b(energia|eletrica|usina|hidreletrica|petroleo|combustivel|gasolina|diesel)\b", "power plant|power|dam|hydroelectric|energy"),
    (r"\b(agro|agricultura|soja|milho|gado|bovino|boi|pecuaria|colheita|safra)\b", "farm harvest|harvest|farm|soybean|cattle|crop"),
    (r"\b(eleicao|eleicoes|urna|voto|votacao|eleitores)\b", "ballot box voting|ballot|voting|election"),
    (r"\b(futebol|jogo|campeonato|gol|estadio)\b", "football stadium|stadium|football|soccer"),
    (r"\b(internet|tecnologia|celular|aplicativo|inteligencia artificial|robo)\b", "smartphone technology|smartphone|phone|technology"),
]


def _norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s).lower()) if unicodedata.category(c) != "Mn")


def keyword_for(text):
    t = _norm(text)
    for rx, q in KEYWORDS:
        if re.search(rx, t): return q
    return ""


def _split(q):
    parts = q.split("|")
    return parts[0], [w.lower() for w in parts[1:]]


def _relevant(text, must):
    t = _norm(text)
    return (not must) or any(re.search(r"\b" + re.escape(_norm(w)), t) for w in must)


def allowed_context(title, scenes):
    """False quando o tema e tragedia/crime ou envolve pessoa: nesses casos nao ha b-roll."""
    blob = _norm(" ".join([str(title)] + [str(x) for x in scenes]))
    return not (TRAGEDY.search(blob) or PERSON.search(blob))


def _download(url):
    r = requests.get(url, headers=UA, timeout=25)
    r.raise_for_status()
    if not 15000 < len(r.content) < 15 * 1024 * 1024: raise ValueError("tamanho de imagem invalido")
    im = Image.open(io.BytesIO(r.content)); im.load()
    im = im.convert("RGB")
    if min(im.size) < 700: raise ValueError("imagem pequena demais")
    return im


def from_openverse(query, skip=()):
    query, must = _split(query)
    r = requests.get("https://api.openverse.org/v1/images/", headers=UA, timeout=25, params={
        "q": query, "license": "cc0,pdm,by", "license_type": "commercial", "size": "large",
        "aspect_ratio": "tall,square", "mature": "false", "page_size": 20})
    r.raise_for_status()
    for it in r.json().get("results", []):
        lic = str(it.get("license", "")).lower()
        if lic not in OK_LIC or it.get("id") in skip: continue
        if not _relevant((it.get("title") or "") + " " + " ".join(t.get("name", "") for t in (it.get("tags") or [])), must): continue
        url = it.get("url")
        if not url or not str(url).lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp")): continue
        try: im = _download(url)
        except Exception: continue
        by = (it.get("creator") or "autor desconhecido")[:40]
        label = "%s (%s%s)" % (by, "CC0" if lic == "cc0" else "Dominio publico" if lic == "pdm" else "CC BY", "" if lic != "by" else " " + str(it.get("license_version") or ""))
        return {"id": it.get("id"), "img": im, "credit": label.strip(), "source": "openverse", "page": it.get("foreign_landing_url") or ""}
    return None


def from_commons(query, skip=()):
    query, must = _split(query)
    r = requests.get("https://commons.wikimedia.org/w/api.php", headers=UA, timeout=25, params={
        "action": "query", "format": "json", "generator": "search", "gsrsearch": query + " filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 12,
        "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 1600})
    r.raise_for_status()
    for pg in sorted((r.json().get("query", {}).get("pages") or {}).values(), key=lambda p: p.get("index", 99)):
        ii = (pg.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata") or {}
        lic = _norm((md.get("LicenseShortName") or {}).get("value", ""))
        if not (lic.startswith("cc0") or lic.startswith("public domain") or lic == "pd" or re.fullmatch(r"cc by \d(\.\d)?", lic)): continue
        if "sa" in lic.split() or "nc" in lic or "nd" in lic: continue
        url = ii.get("thumburl") or ii.get("url")
        if not url or pg.get("title") in skip: continue
        if not _relevant(pg.get("title", "") + " " + re.sub(r"<[^>]+>", "", (md.get("ImageDescription") or {}).get("value", "")), must): continue
        try: im = _download(url)
        except Exception: continue
        artist = re.sub(r"<[^>]+>", "", (md.get("Artist") or {}).get("value", "autor desconhecido"))[:40].strip()
        label = "%s (%s)" % (artist, (md.get("LicenseShortName") or {}).get("value", "")[:20])
        return {"id": pg.get("title"), "img": im, "credit": label, "source": "commons", "page": ii.get("descriptionurl") or ""}
    return None


def find(query, skip=()):
    for fn in (from_openverse, from_commons):
        try:
            got = fn(query, skip)
            if got: return got
        except Exception as e:
            print("broll:", fn.__name__, "falhou:", str(e)[:120], file=sys.stderr)
    return None


def attach(beats, title, scenes, category=""):
    """Marca ate 3 beats com imagem ilustrativa propria. Devolve a lista do que foi usado (para auditoria)."""
    used = []
    if not allowed_context(title, scenes): return used
    seen_q = set(); skip = set()
    for i, b in enumerate(beats):
        if len(used) >= MAX_PER_VIDEO: break
        if i == 0 or b.get("kind") in ("num",): continue
        q = keyword_for(b.get("txt", ""))
        if not q or q in seen_q: continue
        got = find(q, skip)
        if not got: continue
        seen_q.add(q); skip.add(got["id"])
        b.update(kind="photo", bg="dark", img=got["img"], img_credit=got["credit"], pidx=len(used))
        used.append({"beat": i, "query": q, "credit": got["credit"], "source": got["source"], "page": got["page"]})
    return used


if __name__ == "__main__":  # autoteste: python giro_broll.py pasta_saida
    import os
    out = sys.argv[1] if len(sys.argv) > 1 else "broll-teste"; os.makedirs(out, exist_ok=True); rep = []
    for q in [k[1] for k in KEYWORDS if k[1].split("|")[0] in ("highway road", "airplane flying sky", "rocket launch", "car on road", "hospital building", "brazilian real banknotes", "heavy rain storm clouds", "farm harvest", "cargo ship", "drought dry land")]:
        got = find(q)
        if got:
            got["img"].save(os.path.join(out, q.split("|")[0].replace(" ", "_") + ".jpg"), quality=85)
            rep.append({"q": q, "credit": got["credit"], "source": got["source"], "page": got["page"]})
        else: rep.append({"q": q, "credit": None})
    json.dump(rep, open(os.path.join(out, "relatorio.json"), "w"), ensure_ascii=False, indent=1); print(json.dumps(rep, ensure_ascii=False, indent=1))
