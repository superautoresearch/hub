"""Milestone 5 tests: Hub registry + `validate-entry` + `sync` + attempt-log parser."""

from __future__ import annotations

import datetime
import json
import tempfile
import unittest
from pathlib import Path

from sar.new_challenge import create_challenge
from sar.sync import analyze_attempt_log, sync_hub
from sar.toml_compat import dumps


class TestMilestone5HubSync(unittest.TestCase):
    def test_sync_native_external_and_statement_changed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            hub_dir = tmp_path / "hub"
            (hub_dir / "registry").mkdir(parents=True)
            (hub_dir / "generated").mkdir(parents=True)

            # 1. Native challenge fixture 1 (intact statement hash)
            c1 = create_challenge("native-ok", "script", target_dir=tmp_path, owner="alice")
            c1_hash = (c1 / ".sar" / "statement_hash").read_text(encoding="utf-8").strip()
            (hub_dir / "registry" / "native-ok.toml").write_text(
                dumps(
                    {
                        "repo": "alice/native-ok",
                        "kind": "native",
                        "owners": ["alice"],
                        "tags": ["script"],
                        "listed": True,
                        "added": "2026-10-25",
                        "statement_hash": c1_hash,
                        "local_path": str(c1),
                    }
                ),
                encoding="utf-8",
            )

            # 2. Native challenge fixture 2 (tampered statement -> status = "statement-changed")
            c2 = create_challenge("native-tampered", "script", target_dir=tmp_path, owner="bob")
            c2_orig_hash = (c2 / ".sar" / "statement_hash").read_text(encoding="utf-8").strip()
            (c2 / "statement" / "README.md").write_text("Modified after listing!\n", encoding="utf-8")
            (hub_dir / "registry" / "native-tampered.toml").write_text(
                dumps(
                    {
                        "repo": f"file://{c2}",
                        "kind": "native",
                        "owners": ["bob"],
                        "tags": ["script"],
                        "listed": True,
                        "added": "2026-10-25",
                        "statement_hash": c2_orig_hash,
                    }
                ),
                encoding="utf-8",
            )

            # 3. External challenge fixture with a README table
            ext_readme = tmp_path / "EXTERNAL_README.md"
            ext_readme.write_text(
                "# External Speedrun\n\n"
                "## World record history\n\n"
                "| Record time | Date | Contributors | Description |\n"
                "|---|---|---|---|\n"
                "| 32.5 min | 2026-10-01 | @keller | [Initial fused kernel](https://example.com/pr/1) |\n"
                "| 19.2 min | 2026-10-12 | @jordan | [FP8 matmul](https://example.com/pr/2) |\n",
                encoding="utf-8",
            )
            (hub_dir / "registry" / "ext-speedrun.toml").write_text(
                dumps(
                    {
                        "repo": "keller/ext-speedrun",
                        "kind": "external",
                        "owners": ["keller"],
                        "tags": ["gpu"],
                        "listed": True,
                        "added": "2026-10-25",
                        "spec": {
                            "title": "External Speedrun",
                            "summary": "Fast training benchmark",
                            "metric": {"name": "time", "unit": "min", "direction": "min", "scale": "linear"},
                            "verifier": {"type": "manual"},
                            "baseline": {"value": 45.0, "label": "Baseline"},
                            "records_source": {
                                "type": "readme-table",
                                "url": f"file://{ext_readme}",
                                "table_heading": "World record history",
                                "columns": {
                                    "value": "Record time",
                                    "date": "Date",
                                    "author": "Contributors",
                                    "link": "Description",
                                },
                            },
                        },
                    }
                ),
                encoding="utf-8",
            )

            res = sync_hub(hub_dir=hub_dir)
            rows_by_slug = {r["slug"]: r for r in res["global"]["challenges"]}

            self.assertEqual(rows_by_slug["native-ok"]["status"], "ok")
            self.assertEqual(rows_by_slug["native-tampered"]["status"], "statement-changed")
            self.assertEqual(rows_by_slug["ext-speedrun"]["status"], "ok")
            self.assertEqual(rows_by_slug["ext-speedrun"]["records_count"], 2)
            self.assertEqual(rows_by_slug["ext-speedrun"]["current_best"]["value"], 19.2)

    def test_attempt_log_parser_and_claim_expiry(self) -> None:
        now = datetime.datetime(2026, 10, 25, 12, 0, 0, tzinfo=datetime.timezone.utc)
        tracks = [
            {"id": "track-a", "title": "Track A"},
            {"id": "track-b", "title": "Track B"},
            {"id": "track-c", "title": "Track C"},
        ]
        comments = [
            # Active claim on track-a (2 hours ago)
            {
                "author": "alice",
                "created_at": "2026-10-25T10:00:00Z",
                "body": '```sar\nkind = "claim"\ntrack = "track-a"\nagent = "Claude Code"\n```\nWorking on track-a.',
            },
            # Expired claim on track-b (30 hours ago -> > 24h)
            {
                "author": "bob",
                "created_at": "2026-10-24T05:00:00Z",
                "body": '```sar\nkind = "claim"\ntrack = "track-b"\n```\nClaiming track-b.',
            },
            # Claim on track-c followed by an attempt from the same user -> track-c becomes open again!
            {
                "author": "carol",
                "created_at": "2026-10-25T08:00:00Z",
                "body": '```sar\nkind = "claim"\ntrack = "track-c"\n```\n',
            },
            {
                "author": "carol",
                "created_at": "2026-10-25T09:00:00Z",
                "body": '```sar\nkind = "attempt"\ntrack = "track-c"\nresult = "fail"\n```\nPivot degraded bound.',
            },
        ]
        summary = analyze_attempt_log(comments, tracks, now=now)
        self.assertEqual(summary["attempts"], 1)
        open_ids = [t["id"] for t in summary["open_tracks"]]
        self.assertEqual(open_ids, ["track-b", "track-c"])

    def test_all_listed_challenges_and_frontier_workflow(self) -> None:
        from sar.github_ops import build_registration_payload

        hub_root = Path(__file__).resolve().parent.parent
        reg_files = [
            p for p in sorted((hub_root / "registry").glob("*.toml"))
            if not p.name.endswith(".records.toml")
        ]
        self.assertGreaterEqual(len(reg_files), 100)
        self.assertTrue((hub_root / "registry" / "contribution-mining.toml").is_file())
        self.assertTrue((hub_root / "registry" / "parameter-golf-16mb.toml").is_file())
        self.assertTrue((hub_root / "registry" / "slowrun-100m-tokens.toml").is_file())
        self.assertTrue((hub_root / "registry" / "formal-conjectures-erdos-lean.toml").is_file())
        global_json = json.loads((hub_root / "generated" / "global.json").read_text(encoding="utf-8"))
        self.assertEqual(len(global_json["challenges"]), len(reg_files))
        wf_path = hub_root / ".github" / "workflows" / "check-frontier.yml"
        self.assertTrue(wf_path.exists())
        self.assertIn("*/15 * * * *", wf_path.read_text(encoding="utf-8"))
        pages_wf = hub_root / ".github" / "workflows" / "pages.yml"
        self.assertIn("*/15 * * * *", pages_wf.read_text(encoding="utf-8"))

        with tempfile.TemporaryDirectory() as tmp:
            chal_dir = create_challenge("self-ref-test", "script", target_dir=Path(tmp), owner="alice")
            readme_txt = (chal_dir / "README.md").read_text(encoding="utf-8")
            self.assertIn("https://superautoresearch.github.io/hub/#/c/self-ref-test", readme_txt)
            self.assertIn("registry/self-ref-test.toml", readme_txt)
            payload = build_registration_payload(chal_dir)
            self.assertIn("launch.md", payload["pr_body"])
            self.assertIn("donate.md", payload["pr_body"])
            self.assertIn("registry/self-ref-test.toml", payload["pr_body"])


if __name__ == "__main__":
    unittest.main()

