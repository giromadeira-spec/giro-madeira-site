"""Testes offline: nenhum acesso a GitHub, API, rede social ou Supabase."""
import tempfile
import unittest
from pathlib import Path

from scripts.ai_agents.audit import REQUIRED, CHANNELS, build_checks, render_report


class AgentAuditTests(unittest.TestCase):
    def test_missing_files_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            checks = build_checks(Path(directory))
            self.assertTrue(any(c["status"] == "FAIL" for c in checks))
            self.assertIn("FAIL", render_report(checks))

    def test_invalid_active_workflow_fails_without_leaking_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / ".github/workflows/broken.yml"
            path.parent.mkdir(parents=True)
            path.write_text("key: [\nPRIVATE_SOURCE_MARKER", encoding="utf-8")
            checks = build_checks(root)
            found = next(c for c in checks if c["name"] == "YAML inválido: broken.yml")
            self.assertEqual(found["status"], "FAIL")
            self.assertNotIn("PRIVATE_SOURCE_MARKER", render_report(checks))

    def test_complete_fixture_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in REQUIRED:
                p = root / relative
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("", encoding="utf-8")
            (root / "AGENTS.md").write_text(
                "GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1 assets/logo-oficial.webp "
                "Rio Madeira 1080x1080 1080x1920", encoding="utf-8")
            (root / "docs/RADARES_INDEPENDENTES.md").write_text(
                " ".join("giro_radar_" + ch for ch in CHANNELS), encoding="utf-8")
            (root / "scripts/giro_shorts_auto.py").write_text(
                "def main():\n    return 0\n", encoding="utf-8")
            (root / ".github/workflows/giro-tiktok-producao.yml").write_text(
                "# giro-tiktok-production\n# --tiktok\n", encoding="utf-8")
            (root / ".github/workflows/giro-shorts-producao.yml").write_text(
                "# independent shorts workflow\n", encoding="utf-8")
            checks = build_checks(root)
            self.assertFalse(any(c["status"] == "FAIL" for c in checks))
            report = render_report(checks)
            self.assertIn("PASS", report)
            self.assertIn("não comprova", report)


if __name__ == "__main__":
    unittest.main()
