"""Testa orquestração real LangGraph e API simulada; nunca publica nem cobra."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import yaml

from scripts.ai_agents import audit
from scripts.ai_agents.orchestrate import run_audit

ROOT = Path(__file__).resolve().parents[1]


class OrchestrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.report = self.folder / "report.md"
        self.db = self.folder / "checkpoints.sqlite"

    def run_graph(self, **kwargs):
        return run_audit(ROOT, self.report, self.db, "test-task", **kwargs)

    def test_offline_never_calls_api_or_modifies_sources(self):
        before = {name: (ROOT / name).read_bytes() for name in audit.REQUIRED}
        with patch("urllib.request.urlopen", side_effect=AssertionError("network")):
            self.assertEqual(self.run_graph(), 0)
        self.assertIn("offline, sem API", self.report.read_text())
        self.assertTrue(self.db.is_file())
        self.assertEqual(before, {name: (ROOT / name).read_bytes() for name in audit.REQUIRED})

    def test_two_ai_roles_and_completed_task_is_not_repeated(self):
        calls = []
        def consult(role, instructions, evidence):
            calls.append(role)
            return "Parecer " + role
        self.assertEqual(self.run_graph(use_ai=True, consult=consult), 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.run_graph(use_ai=True, consult=consult), 0)
        self.assertEqual(len(calls), 2)

    def test_resume_failed_reviewer_preserves_auditor_and_hides_exception(self):
        calls = []
        def failing(role, instructions, evidence):
            calls.append(role)
            if len(calls) == 2:
                raise RuntimeError("SECRET_EXCEPTION_SHOULD_NOT_BE_PERSISTED")
            return "Parecer do auditor preservado"
        self.assertEqual(self.run_graph(use_ai=True, consult=failing), 2)
        self.assertIn("Parecer do auditor preservado", self.report.read_text())
        self.assertNotIn(b"SECRET_EXCEPTION", self.db.read_bytes())
        def recovering(role, instructions, evidence):
            calls.append(role)
            self.assertIn("Parecer do auditor preservado", evidence)
            return "Revisão concluída"
        self.assertEqual(self.run_graph(use_ai=True, consult=recovering), 0)
        self.assertEqual(len(calls), 3)
        self.assertTrue(calls[-1].startswith("Revisor"))

    def test_changing_ai_mode_blocks_resume(self):
        self.assertEqual(self.run_graph(), 0)
        def never(*args):
            self.fail("must not call API on mode mismatch")
        self.assertEqual(self.run_graph(use_ai=True, consult=never), 2)
        self.assertIn("Retomada bloqueada", self.report.read_text())

    def test_changed_files_block_resume(self):
        with patch("scripts.ai_agents.orchestrate.fingerprint", return_value="one"):
            self.assertEqual(self.run_graph(), 0)
        with patch("scripts.ai_agents.orchestrate.fingerprint", return_value="two"):
            self.assertEqual(self.run_graph(), 2)

    def test_secret_response_is_not_checkpointed(self):
        secret = "sk-fake-test-only-sensitive-value"
        with patch.dict(os.environ, {"OPENAI_API_KEY": secret}):
            self.assertEqual(self.run_graph(use_ai=True, consult=lambda *args: secret), 2)
        self.assertNotIn(secret, self.report.read_text())
        self.assertNotIn(secret.encode(), self.db.read_bytes())

    def test_missing_repository_still_fails_closed(self):
        root = self.folder / "empty"
        root.mkdir()
        status = run_audit(root, self.report, self.db, "missing")
        self.assertEqual(status, 1)
        self.assertIn("FAIL", self.report.read_text())


class PaidApiDisabledTests(unittest.TestCase):
    def test_api_disabled_even_with_key_in_environment(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-fake-test-key"}), patch("urllib.request.urlopen") as call:
            with self.assertRaisesRegex(RuntimeError, "desativadas"):
                audit.consult_agent("Auditor", "instruções", "evidência pública")
        call.assert_not_called()

    def test_cli_preserves_report_without_api(self):
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "report.md"
            with patch("urllib.request.urlopen") as call, patch(
                "sys.argv", ["audit.py", "--use-ai", "--report", str(report)]):
                self.assertEqual(audit.main(), 2)
            call.assert_not_called()
            self.assertIn("zero gasto adicional", report.read_text())

    def test_graph_paid_mode_cannot_call_api(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-fake-test-key"}), patch("urllib.request.urlopen") as call:
                self.assertEqual(run_audit(ROOT, path / "report.md", path / "state.sqlite", "blocked", use_ai=True), 2)
            call.assert_not_called()
            self.assertIn("zero gasto adicional", (path / "report.md").read_text())


class WorkflowTests(unittest.TestCase):
    def test_workflow_has_no_paid_api_path_secrets_or_artifact_storage(self):
        source = (ROOT / ".github/workflows/ai-agent-audit.yml").read_text()
        workflow = yaml.load(source, Loader=yaml.BaseLoader)
        self.assertEqual(workflow["permissions"], {"contents": "read"})
        self.assertIn("schedule", workflow["on"])
        self.assertEqual(workflow["on"]["workflow_dispatch"], "")
        self.assertEqual(workflow["jobs"]["auditoria"]["runs-on"], "ubuntu-latest")
        self.assertNotIn("secrets.", source)
        self.assertNotIn("--use-ai", source)
        self.assertNotIn("OPENAI_API_KEY", source)
        self.assertNotIn("upload-artifact", source)
        steps = workflow["jobs"]["auditoria"]["steps"]
        checkout = next(s for s in steps if "actions/checkout" in s.get("uses", ""))
        self.assertEqual(checkout["with"]["persist-credentials"], "false")


if __name__ == "__main__":
    unittest.main()
