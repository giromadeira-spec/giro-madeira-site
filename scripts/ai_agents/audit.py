#!/usr/bin/env python3
"""Auditoria de leitura do Giro Madeira. Nunca publica, altera filas ou escreve no GitHub.

Modos:
  python scripts/ai_agents/audit.py --report artifacts/ai-agent-report.md
  python scripts/ai_agents/audit.py --use-ai --report artifacts/ai-agent-report.md

O modo IA exige OPENAI_API_KEY configurada no ambiente (secret do GitHub).
"""
from __future__ import annotations

import argparse
import ast
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from urllib import error, request

REPO_ROOT = Path(__file__).resolve().parents[2]
REQUIRED = (
    "AGENTS.md",
    "docs/RADARES_INDEPENDENTES.md",
    "docs/GIRO_MADEIRA_PADRAO_VISUAL.md",
    "docs/REFERENCIA_CAPA_OFICIAL.md",
    "scripts/giro_shorts_auto.py",
    ".github/workflows/giro-shorts-producao.yml",
    ".github/workflows/giro-tiktok-producao.yml",
)
CHANNELS = ("shorts", "tiktok", "feed", "stories", "reels")
MAX_RESPONSE = 1_800


def read_text(root: Path, relative: str) -> str:
    path = root / relative
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def build_checks(root: Path) -> list[dict[str, str]]:
    checks: list[dict[str, str]] = []

    def add(name: str, status: str, detail: str) -> None:
        checks.append({"name": name, "status": status, "detail": detail})

    for relative in REQUIRED:
        found = (root / relative).is_file()
        add("Arquivo: " + relative, "PASS" if found else "FAIL",
            "Encontrado" if found else "Ausente; verificar antes de executar agentes")

    agents = read_text(root, "AGENTS.md")
    for marker in ("GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1", "assets/logo-oficial.webp",
                   "Rio Madeira", "1080x1080", "1080x1920"):
        add("Contrato visual: " + marker,
            "PASS" if marker in agents else "WARN",
            "Marcador documentado" if marker in agents else "Revisar contrato visual")
    radars = read_text(root, "docs/RADARES_INDEPENDENTES.md")
    for channel in CHANNELS:
        marker = "giro_radar_" + channel
        add("Radar documentado: " + channel,
            "PASS" if marker in radars else "WARN",
            "Documentação localizada" if marker in radars
            else "Não encontrado na documentação (não prova falha em produção)")

    source_path = root / "scripts/giro_shorts_auto.py"
    if source_path.is_file():
        try:
            ast.parse(source_path.read_text(encoding="utf-8"), filename=str(source_path))
            add("Sintaxe Python do renderizador", "PASS", "AST válida, sem executar scripts")
        except (SyntaxError, UnicodeError) as exc:
            add("Sintaxe Python do renderizador", "FAIL", str(exc).splitlines()[0])

    tiktok = read_text(root, ".github/workflows/giro-tiktok-producao.yml")
    add("TikTok: execução explicitamente independente",
        "PASS" if "--tiktok" in tiktok and "giro-tiktok-production" in tiktok else "WARN",
        "Flags e concorrência próprias encontradas" if "--tiktok" in tiktok and
        "giro-tiktok-production" in tiktok else "Revisar workflow de TikTok")

    shorts = read_text(root, ".github/workflows/giro-shorts-producao.yml")
    add("Shorts: workflow separado", "PASS" if shorts else "FAIL",
        "Workflow próprio presente" if shorts else "Workflow ausente")

    workflows = root / ".github/workflows"
    writing = []
    if workflows.is_dir():
        for workflow in sorted(workflows.glob("*.yml")):
            content = workflow.read_text(encoding="utf-8", errors="replace")
            if "contents: write" in content:
                writing.append(workflow.name)
    add("Workflows existentes com escrita GitHub",
        "WARN" if writing else "PASS",
        "Revisar permissões de: " + ", ".join(writing) if writing
        else "Nenhum gatilho textual contents: write encontrado")
    # Atenção: checagem estática, NÃO verifica status de Supabase, Meta, TikTok ou YouTube.
    return checks


def render_report(checks: list[dict[str, str]]) -> str:
    counts = {state: sum(c["status"] == state for c in checks)
              for state in ("PASS", "WARN", "FAIL")}
    lines = [
        "# Giro Madeira — auditoria de agentes (somente leitura)",
        "",
        "Gerado em " + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC") + ".",
        "",
        "**Escopo:** arquivos versionados, contratos documentais e sintaxe; "
        "não comprova o estado real do Supabase, das filas ou das redes sociais.",
        "",
        "**Resultado:** " + " · ".join(f"{k}: {v}" for k, v in counts.items()),
        "",
        "| Verificação | Estado | Evidência |",
        "|---|---|---|",
    ]
    for check in checks:
        parts = [str(check[field]).replace("|", "/").replace("\n", " ")
                 for field in ("name", "status", "detail")]
        lines.append("| " + " | ".join(parts) + " |")
    lines.extend(["", "**Restrições:** não publica, não corrige automaticamente, "
                  "não consulta segredos e não altera radares nem autorização de canais.", ""])
    return "\n".join(lines)


def response_text(body: dict) -> str:
    fragments = []
    for item in body.get("output", []):
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if part.get("type") == "output_text":
                fragments.append(part.get("text", ""))
    return "\n".join(fragments).strip()


def consult_agent(role: str, instructions: str, evidence: str) -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY ausente: configure como secret do GitHub")
    model = os.environ.get("OPENAI_MODEL", "").strip() or "gpt-5.5"
    payload = {
        "model": model,
        "instructions": instructions,
        "input": "Papel: " + role + "\nEvidência estática do repositório:\n" + evidence,
        "max_output_tokens": MAX_RESPONSE,
        "store": False,
    }
    req = request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=90) as response:
            result = json.load(response)
    except error.HTTPError as exc:
        # Não imprima o corpo HTTP (pode incluir dados do provedor).
        raise RuntimeError(f"API de IA retornou HTTP {exc.code}") from None
    except error.URLError as exc:
        raise RuntimeError("API de IA indisponível ou falha de rede") from exc
    output = response_text(result)
    if not output:
        raise RuntimeError("API de IA não retornou texto; valide modelo e limite de saída")
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=REPO_ROOT)
    parser.add_argument("--report", type=Path, default=Path("artifacts/ai-agent-report.md"))
    parser.add_argument("--use-ai", action="store_true", help="Duas análises IA, com chave secreta")
    args = parser.parse_args()

    checks = build_checks(args.root.resolve())
    report = render_report(checks)
    failed = any(check["status"] == "FAIL" for check in checks)
    if args.use_ai:
        evidence = json.dumps(checks, ensure_ascii=False)
        auditor = consult_agent(
            "Auditor de confiabilidade",
            "Você avalia SOMENTE fatos evidenciados pelo checklist fornecido. "
            "Escreva em português, priorize achados P0/P1/P2. "
            "Não confunda documentação com serviço em execução. "
            "Não invente logs, métricas ou status de publicação. "
            "Não sugira liberar canais, executar postagens ou alterar produção.",
            evidence,
        )
        planner = consult_agent(
            "Revisor de arquitetura e testes",
            "Com base estrita no checklist e no parecer anterior, apresente até "
            "cinco melhorias testáveis, com teste e reversão definidos. "
            "Priorize isolamento de Shorts/TikTok/Feed/Stories/Reels. "
            "Não solicite publicação nem acesso a segredos. "
            "Responda em português e diga o que ainda precisa ser validado.",
            evidence + "\nParecer do auditor:\n" + auditor[:8_000],
        )
        report += "\n## Agente 1 — Auditor\n\n" + auditor
        report += "\n\n## Agente 2 — Revisor\n\n" + planner + "\n"
    path = args.report.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report, encoding="utf-8")
    print(f"Relatório gerado: {path} | checagens={len(checks)} | falhas={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
