"""Testa orquestração real LangGraph e API simulada; nunca publica nem cobra."""
import io
import json
import os
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

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
        with patch.object(audit.request, "urlopen", side_effect=AssertionError("network")):
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


class ResponsesTests(unittest.TestCase):
    def setUp(self):
        context = patch.dict(os.environ, {"OPENAI_API_KEY": "sk-fake-test-key", "OPENAI_MODEL": "gpt-5.5"})
        context.start()
        self.addCleanup(context.stop)

    def test_response_parsing_and_payload_no_tools_or_storage(self):
        response = {"status": "completed", "output": [
            {"type": "reasoning"}, {"type": "message", "content": [
                {"type": "output_text", "text": "Parecer"}]}]}
        with patch.object(audit.request, "urlopen", return_value=io.BytesIO(json.dumps(response).encode())) as call:
            self.assertEqual(audit.consult_agent("Auditor", "read only", "public checklist"), "Parecer")
        request = call.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, "https://api.openai.com/v1/responses")
        self.assertIs(payload["store"], False)
        self.assertNotIn("tools", payload)
        self.assertEqual(payload["max_output_tokens"], audit.MAX_RESPONSE)
        self.assertNotIn("sk-fake", request.data.decode())

    def test_incomplete_response_rejected(self):
        data = {"status": "incomplete", "output": [{"type": "message", "content": [
            {"type": "output_text", "text": "partial"}]}]}
        with patch.object(audit.request, "urlopen", return_value=io.BytesIO(json.dumps(data).encode())):
            with self.assertRaisesRegex(RuntimeError, "incompleta"):
                audit.consult_agent("a", "b", "c")

    def test_http_body_not_exposed(self):
        error = HTTPError("https://api.openai.com", 401, "secret detail", {}, io.BytesIO(b"secret body"))
        with patch.object(audit.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "HTTP 401") as result:
                audit.consult_agent("a", "b", "c")
        self.assertNotIn("secret", str(result.exception))

    def test_no_key_makes_no_network_request(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}), patch.object(audit.request, "urlopen") as call:
            with self.assertRaisesRegex(RuntimeError, "ausente"):
                audit.consult_agent("a", "b", "c")
        call.assert_not_called()

    def test_legacy_cli_preserves_offline_report_on_api_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "report.md"
            with patch.object(audit, "consult_agent", side_effect=RuntimeError("secret")), patch(
                "sys.argv", ["audit.py", "--use-ai", "--report", str(report)]):
                self.assertEqual(audit.main(), 2)
            self.assertIn("IA não concluída", report.read_text())
            self.assertNotIn("secret", report.read_text())


class WorkflowTests(unittest.TestCase):
    def test_schedule_and_secret_are_isolated_from_prs(self):
        workflow = yaml.load((ROOT / ".github/workflows/ai-agent-audit.yml").read_text(), Loader=yaml.BaseLoader)
        self.assertEqual(workflow["permissions"], {"contents": "read"})
        self.assertIn("schedule", workflow["on"])
        self.assertEqual(workflow["on"]["workflow_dispatch"]["inputs"]["use_ai"]["default"], "false")
        steps = workflow["jobs"]["auditoria"]["steps"]
        secret_steps = [s for s in steps if "OPENAI_API_KEY" in s.get("env", {})]
        self.assertEqual(len(secret_steps), 2)
        condition = secret_steps[0]["if"]
        self.assertIn("refs/heads/main", condition)
        self.assertIn("workflow_dispatch", condition)
        self.assertIn("GIRO_AGENT_AI_ENABLED == 'true'", condition)
        self.assertIn("GIRO_AGENT_AI_ENABLED == ''", condition)
        self.assertIn("[test-ai]", condition)
        self.assertNotIn("pull_request", condition)
        self.assertIn("refs/heads/main", secret_steps[1]["if"])
        self.assertIn("steps.ai_preflight.outputs.ready == 'true'", secret_steps[1]["if"])
        checkout = next(s for s in steps if "actions/checkout" in s.get("uses", ""))
        self.assertEqual(checkout["with"]["persist-credentials"], "false")

    def run_preflight(self, key):
        workflow = yaml.load((ROOT / ".github/workflows/ai-agent-audit.yml").read_text(), Loader=yaml.BaseLoader)
        step = next(s for s in workflow["jobs"]["auditoria"]["steps"] if s.get("id") == "ai_preflight")
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "artifacts").mkdir()
            report = folder / "artifacts/ai-agent-report.md"
            report.write_text("Evidencia offline preservada\n")
            output = folder / "outputs"
            result = subprocess.run(["bash", "-c", step["run"]], cwd=folder,
                                    env={"PATH": os.environ["PATH"], "OPENAI_API_KEY": key,
                                         "GITHUB_OUTPUT": str(output)}, capture_output=True, text=True, check=True)
            return output.read_text(), report.read_text(), result.stdout + result.stderr

    def test_missing_key_records_pending_and_preserves_report(self):
        output, report, logs = self.run_preflight("")
        self.assertEqual(output.strip(), "ready=false")
        self.assertIn("Evidencia offline preservada", report)
        self.assertIn("IA pendente", report)

    def test_existing_key_is_not_emitted(self):
        key = "sk-fake-only-preflight-test"
        output, report, logs = self.run_preflight(key)
        self.assertEqual(output.strip(), "ready=true")
        self.assertNotIn(key, output + report + logs)
        self.assertNotIn("IA pendente", report)


if __name__ == "__main__":
    unittest.main()
