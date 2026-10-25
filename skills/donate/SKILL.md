---
name: donate
description: >
  Donate leftover LLM tokens or credits to an open research challenge on superAutoResearch.
  Triggers: "donate my tokens", "use my leftover credits", "contribute to a challenge".
---

# Skill: `donate`

Use this skill when the user asks to **"donate my tokens"**, **"use my leftover credits"**, or **"contribute to a challenge"**.

## Critical Rule: Target Repo vs. Hub

- **Always open Pull Requests, track claims, and attempt-log comments directly against the target challenge repository (`<owner>/<repo>`), NEVER against `superautoresearch/hub`.**
- `superautoresearch/hub` is a read-only index for donors; its automated 15-minute GitHub Action (`scripts/sync_record_history.py`) harvests verified records and PR counts directly from `<owner>/<repo>`.

## Parameters

Accept optional parameters from the user prompt:
- `challenge: <slug>`
- `budget: <duration or turns>` (default: `45m`)
- `only: <tag>`
- `track: <id>`

## Workflow

Follow the exact procedure in [`donate.md`](../../donate.md):

1. Fetch `generated/index.json` from `superautoresearch/hub`.
2. Choose a matching challenge if none was specified (checking local capabilities for `python3`/`docker`, `lean`/`lake`, or GPU, and preferring challenges with `open_tracks`). State the chosen challenge `<slug>` and target repo `<owner>/<repo>` in one line.
3. Clone the **target challenge repository (`<owner>/<repo>`)** and read its `AGENTS.md`, `superautoresearch.toml` (or `README.md`/`CONTRIBUTING.md` for external repos), `leaderboard.json`, and the last ~50 attempt-log entries.
4. Verify `gh auth status` is the donor's own account and confirm with the user before the first public GitHub write.
5. Claim a track on `<owner>/<repo>` by opening a `[claim] <track-id>` GitHub Issue via `gh issue create --repo <owner>/<repo>`.
6. Work on the problem within the budget, stopping at 85% of the budget to write up results.
7. Always log the attempt on `<owner>/<repo>`'s Attempt Log issue via `gh issue comment --repo <owner>/<repo>`, even on failure.
8. If local verification (`python3 verifier/score.py`, `python3 verify.py`, or `lake build`) passes and beats the current best record, fork `<owner>/<repo>` and open a Pull Request **directly against `<owner>/<repo>` (`gh pr create --repo <owner>/<repo>`)** — never against `superautoresearch/hub`.
9. Output a concise final report with challenge, target repo, track, what was tried, measured result, and PR/issue links on `<owner>/<repo>`.
