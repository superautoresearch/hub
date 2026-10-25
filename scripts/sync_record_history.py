#!/usr/bin/env python3
"""Standalone script for GitHub Actions to sync record histories and PR/attempt counts across all challenges.

Usage:
    python3 scripts/sync_record_history.py --hub .
    python3 scripts/sync_record_history.py --hub . --only integer-multiplication
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sar.history_sync import sync_all_record_histories
from sar.sync import sync_hub


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync upstream GitHub PR/commit attempt counts and record progression histories for each challenge."
    )
    parser.add_argument("--hub", default=".", help="Path to the superautoresearch/hub root directory")
    parser.add_argument("--only", default=None, help="Sync only a single challenge slug")
    parser.add_argument("--no-github-activity", action="store_true", help="Skip live PR/commit pagination count query")
    args = parser.parse_args()

    hub_dir = Path(args.hub).resolve()
    summary = sync_all_record_histories(
        hub_dir=hub_dir,
        only_slug=args.only,
        sync_github_activity=not args.no_github_activity,
    )
    sync_hub(hub_dir=hub_dir, only_slug=args.only)

    changed = [
        c for c in summary["challenges"]
        if c["records_after"] != c["records_before"] or c["attempts"] >= 20
    ]
    print(f"Synced {summary['total_synced']} challenges at {summary['synced_at']}:")
    for c in changed:
        print(
            f"  {c['slug']:36s} | records: {c['records_before']:2d} -> {c['records_after']:2d} "
            f"| attempts (PRs/commits): {c['attempts']:5d} | contributors: {c['contributors']:3d} "
            f"| best: {c['frontier_best']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
