# Unikie handover — Knowledge Hub Contribution Evaluator (MVP)

Local evaluator for **baseline (neutral prompt) ↔ candidate (skill SKILL.md)** on a fixed task family, with Scorecard, Comparison, and Benefit Report.

## Start

1. Copy `.env.example` → `.env`, set `OPENAI_API_KEY` (optional for smoke).
2. `.\start.ps1` (or `start.bat`) — web + worker.
3. Open http://127.0.0.1:30001

Preflight on New run checks API key, Docker, and worker.

## Unikie flow (Find → Capture → Test → Recommend)

| Step | How |
| --- | --- |
| **Find / Receive** | New run → GitHub URL → **Import skill**, or use bundled `eval-skills/*`. Imports land in `data/imported-skills/` with `.import.json` (owner, repo, ref). |
| **Capture** | Each run writes `capture.json` + `result.capture` (githubUrl, commit, license, deps, promptHash/preview, env snapshot). |
| **Test / Measure** | Default **baseline↔candidate** queues two jobs (same skill, mode, repeats, model). Grade = Docker scripts vs expected. Official ≥3 repeats, model `gpt-4.1-mini`. |
| **Explain / Recommend** | **Comparison** = lift PASS/FAIL (≥ +5 pp). **Benefit Report** = per-run adoption narrative (baseline alone is inconclusive). |

## UI map

- `/` New evaluation (paired by default)
- `/runs` + `/runs/[runId]` status, scorecard, tokens, CSV
- `/comparison` + `/comparison/[evaluationId]` parity, per-task regressions, CSV
- `/benefit/[runId]` Scorecard + recommendation + Markdown export
- `/dashboard` skill overview

## Models (locked)

| Mode | Model |
| --- | --- |
| dry-run | `gpt-4o-mini` |
| official | `gpt-4.1-mini` (≥3 repeats) |

## Pilot (D5) — official paired run

1. Docker running; worker + web up; enough OpenAI credits.
2. New run → skill `code-debugging-eval` → mode **official** → baseline↔candidate **on**.
3. Consider raising `COST_CAP_USD` (8 tasks × 3 repeats × 2 legs ≈ many produce calls).
4. Wait on Comparison until both legs finish; download CSV; keep `data/results/eval_*` + both `run_*` folders.

Smoke without API (pairing + Comparison plumbing):

```bat
npm run smoke:paired
```

Harness grade smoke (no LLM):

```bat
npm run smoke:skills
```

## Criteria (short)

- Soft-pass task floor: score ≥ 0.8
- Unikie Comparison PASS: candidate score ≥ 0.8 **and** lift ≥ +0.05 vs baseline
- Official Benefit USE: near-perfect official candidate score (see Benefit Report)
- Result ≠ Knowledge Hub production adoption proof (disclaimer on Benefit)

## Limits

- One primary task family in MVP demo: **cde-v1** (code debugging, 8 tasks) — see [D1-TASK-FAMILY.md](D1-TASK-FAMILY.md)
- No multi-model dashboard; no cloud multi-user service
- Retry reuses skill/mode/repeats/role/evaluationId and locks candidate **SKILL.md** from the prior run’s `skill-snapshot/` when present (fixtures still load from the live skill tree); each run stores its own immutable `skill-snapshot/` under `data/results/<runId>/`
- Benefit narrative: Markdown; scorecard also **CSV** (`?format=csv`). Run/Comparison CSV via download buttons.

## Re-run

Retry from a failed/cancelled/budget_stop run detail page preserves `role` and `evaluationId` when present. For a fresh pair, start again from New run.
