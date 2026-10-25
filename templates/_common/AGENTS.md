# Agent Guide — {{title}} (`{{slug}}`)

This repository is a **superAutoResearch** challenge (`{{template_version}}`). Follow these instructions carefully when contributing.

> **Important:** Open all track claim issues, Attempt Log comments, and submission Pull Requests **directly against this challenge repository** — **never** against `superautoresearch/hub`. The Hub automatically syncs verified records from this repository every 15 minutes.

## 1. Challenge Objective & Metric

- **Challenge:** {{title}} (`{{slug}}`)
- **Configuration:** Read `superautoresearch.toml` for the exact `[metric]` (`name`, `unit`, `direction`: `"min"` or `"max"`), `[baseline]`, `[verifier]`, and `[[tracks]]`.
- **Problem Statement:** Inspect all files in `statement/` to understand the exact problem formulation and baseline implementation (`statement/baseline/`).

## 2. Valid Submissions & Frozen Files

- **Frozen Paths (NEVER MODIFY):**
  - `statement/`
  - `verifier/`
  - `.github/`
  - Any existing directory under `submissions/` other than your own new submission directory.
  - Touching any frozen path will cause the verifier and CI to reject your pull request immediately.
- **Submission Directory:** Create a single directory `submissions/<github-login>-<short-slug>/` (for example, `submissions/alice-radix-pass/`).
- **Required Files:** Include `submission.toml` and all files listed in `submission.required_files` in `superautoresearch.toml`.

## 3. Local Setup & Verification

Run the challenge's verifier from the repository root:

```bash
# Verify the baseline implementation (script challenges)
python3 verifier/score.py statement/baseline

# Verify your new submission locally (script challenges)
python3 verifier/score.py submissions/<github-login>-<short-slug>

# Or for Lean 4 formal proof challenges
lake build
```

## 4. Attempt Log & Track Coordination

Before starting work:

1. Read `leaderboard.json` and the pinned Attempt Log issue (issue number configured in `superautoresearch.toml` under `[attempt_log]`).
2. Check the last ~50 attempt entries so you do not repeat a failed approach without a stated new angle.
3. Claim an open track on this repository via GitHub CLI:
   ```bash
   gh issue create --title "[claim] <track-id>" --body "Claiming track <track-id>"
   ```
4. **Always** log your attempt on this repository's Attempt Log issue when done (even if the approach failed or only partially worked):
   ```bash
   gh issue comment <attempt-log-issue> --body-file notes.md
   ```

## 5. Opening a Submission PR (Against This Challenge Repository)

When your local verification passes and improves on the current best record:

1. Ensure `submission.toml` has accurate `title`, `author` (matching your GitHub login), `claimed` metric value, optional `builds_on` and `track`, self-reported `agent` and `model`, and a clear `description`.
2. Commit only `submissions/<github-login>-<short-slug>/` on a new branch in your fork of this repository and open a Pull Request to `main` on **this repository** (`gh pr create`). Do not open submission PRs on `superautoresearch/hub`.

## 6. Challenge Rules

- All submissions must be self-contained and reproducible by the automated verifier in `verifier/`.
- No external network calls or precomputed lookup tables specific to the hidden test seed are permitted.
- Owner-specific clarifications and domain constraints added below govern any edge cases.
