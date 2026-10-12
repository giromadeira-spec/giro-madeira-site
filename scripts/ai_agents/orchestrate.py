#!/usr/bin/env python3
"""LangGraph somente leitura: evidência -> auditor -> revisor -> relatório.

Checkpoints locais não possuem tokens nem estado de publicação. Reexecutar com
o mesmo --task-id e --checkpoint retoma apenas etapas incompletas, desde que o
código, modo IA e modelo sejam idênticos. No Actions cada run é independente.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
from typing import TypedDict

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from scripts.ai_agents import audit


class AuditState(TypedDict, total=False):
    checks: list[dict[str, str]]
    fingerprint: str
    use_ai: bool
    auditor: str
    reviewer: str
    complete: bool


def fingerprint(root: Path, use_ai: bool) -> str:
    digest = hashlib.sha256()
    digest.update(b"giro-audit-graph-v1")
    model = os.environ.get("OPENAI_MODEL", "").strip() or audit.DEFAULT_MODEL
    digest.update(json.dumps({"use_ai": use_ai, "model": model if use_ai else "offline"}).encode())
    paths = set(audit.REQUIRED)
    for folder in (".github/workflows", "scripts/ai_agents"):
        paths.update(p.relative_to(root).as_posix() for p in (root / folder).glob("*")
                     if p.suffix in (".py", ".yml", ".yaml", ".txt"))
    for name in sorted(paths):
        digest.update(name.encode())
        path = root / name
        digest.update(path.read_bytes() if path.is_file() else b"MISSING")
    return digest.hexdigest()


def build_graph(checkpointer, consult=audit.consult_agent):
    def safe_consult(role, instructions, evidence):
        try:
            result = consult(role, instructions, evidence)
            key = os.environ.get("OPENAI_API_KEY", "").strip()
            if key and key in result:
                raise ValueError("credential")
            return result
        except Exception:
            # LangGraph persiste erros: remover detalhes ANTES do checkpoint.
            raise RuntimeError("Etapa IA indisponível; revisar configuração") from None

    def auditor(state: AuditState):
        if not state["use_ai"]:
            return {"auditor": "Não solicitado: auditoria offline, sem chamada à API."}
        return {"auditor": safe_consult("Auditor de confiabilidade", audit.AUDITOR_INSTRUCTIONS,
                                   json.dumps(state["checks"], ensure_ascii=False))}

    def reviewer(state: AuditState):
        if not state["use_ai"]:
            return {"reviewer": "Não solicitado: revisão IA depende de ativação e chave."}
        evidence = json.dumps(state["checks"], ensure_ascii=False)
        return {"reviewer": safe_consult("Revisor de arquitetura e testes", audit.REVIEWER_INSTRUCTIONS,
                                    evidence + "\nParecer do auditor:\n" + state["auditor"][:8_000])}

    builder = StateGraph(AuditState)
    builder.add_node("auditor", auditor)
    builder.add_node("revisor", reviewer)
    builder.add_node("concluir", lambda state: {"complete": True})
    builder.add_edge(START, "auditor")
    builder.add_edge("auditor", "revisor")
    builder.add_edge("revisor", "concluir")
    builder.add_edge("concluir", END)
    return builder.compile(checkpointer=checkpointer)


def run_audit(root: Path, report: Path, checkpoint: Path, task_id: str,
              use_ai: bool = False, consult=audit.consult_agent) -> int:
    checks = audit.build_checks(root)
    signature = fingerprint(root, use_ai)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(audit.render_report(checks), encoding="utf-8")
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    config = {"configurable": {"thread_id": task_id}}
    # Estado contém somente dict/list/str/bool, sem pickle nem classes externas.
    serde = JsonPlusSerializer(allowed_msgpack_modules=[], pickle_fallback=False)
    with sqlite3.connect(str(checkpoint), check_same_thread=False) as connection:
        graph = build_graph(SqliteSaver(connection, serde=serde), consult)
        previous = graph.get_state(config)
        if previous.values and previous.values.get("fingerprint") != signature:
            report.write_text(audit.render_report(checks) +
                              "\n**Retomada bloqueada:** código, modo ou modelo mudou; "
                              "use outro task-id para uma nova auditoria.\n", encoding="utf-8")
            return 2
        try:
            if previous.values:
                state = graph.invoke(None, config) if previous.next else previous.values
            else:
                state = graph.invoke({"checks": checks, "fingerprint": signature,
                                      "use_ai": use_ai, "complete": False}, config)
        except Exception:
            state = graph.get_state(config).values
            complete = False
        else:
            complete = bool(state.get("complete"))
    result = audit.render_report(checks)
    result += "\n## Orquestração LangGraph\n\n"
    result += "Modo: " + ("IA via API" if use_ai else "offline, sem API") + ".\n\n"
    for name, title in (("auditor", "Auditor"), ("reviewer", "Revisor")):
        if state.get(name):
            result += "### " + title + "\n\n" + state[name] + "\n\n"
    result += ("**Etapas concluídas.**\n" if complete else
               "**Etapa IA não concluída.** Evidência e checkpoints preservados; "
               "retome com o mesmo task-id/checkpoint após corrigir a causa. "
               "Verifique chave, modelo, saldo, rede e limite de saída.\n")
    report.write_text(result, encoding="utf-8")
    if not complete:
        return 2
    return 1 if any(c["status"] == "FAIL" for c in checks) else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=audit.REPO_ROOT)
    parser.add_argument("--report", type=Path, default=Path("artifacts/ai-agent-report.md"))
    parser.add_argument("--checkpoint", type=Path, default=Path("artifacts/ai-agent-checkpoints.sqlite"))
    parser.add_argument("--task-id", default=os.environ.get("GITHUB_RUN_ID", "local-audit"))
    parser.add_argument("--use-ai", action="store_true")
    args = parser.parse_args()
    status = run_audit(args.root.resolve(), args.report.resolve(), args.checkpoint.resolve(),
                       args.task_id, args.use_ai)
    print(f"Auditoria LangGraph: status={status}; relatório e checkpoints preservados.")
    return status


if __name__ == "__main__":
    sys.exit(main())
