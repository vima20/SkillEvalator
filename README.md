# SkillEvalator

Unikie Contribution Evaluator MVP: **baseline (neutral) ↔ candidate (SKILL.md) → produce → Docker grade → Comparison / Benefit**.

## Quick start

1. Copy `.env.example` → `.env` and set `OPENAI_API_KEY` (optional for smoke).
2. Install + run:

```bat
start.bat
```

or

```powershell
.\start.ps1
```

Open http://127.0.0.1:30001 (bound to loopback only). Optional `WEB_AUTH_TOKEN` gates `/api/*` and pages (redirect to `/unlock` before RSC); the UI sets a `se_auth` cookie after unlock.

CI: `npm run ci` runs unit tests, `typecheck`, `smoke:skills`, `smoke:paired`, `smoke:official`, and `smoke:export`. New Run defaults to **baseline↔candidate**, cost estimate, and **Find/Receive** import (GitHub URL or local `.zip`).

D1 task family: [docs/D1-TASK-FAMILY.md](docs/D1-TASK-FAMILY.md).  
Live pilot: [docs/PILOT-CHECKLIST.md](docs/PILOT-CHECKLIST.md) · acceptance: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).  
In the UI, **Settings** shows `pilotReady`, preflight, adoption rules, git SHA, and the job queue.

### Live pilot / evidence (short)

- **Settings Ready** ≠ Comparison PASS / Benefit USE — same blockers gate official enqueue (API key, Docker, worker, unset `FAKE_PRODUCE` + `ALLOW_HOST_GRADE`, auth, no orphan `.running.json`).
- **`?focus=pilot`**: hides smoke / not_attested / dry-run noise on lists; New run / Settings / Nav keep the focus.
- Live official pins **`produceAttested=true`** on both tip legs. CSV / Benefit / pilot archive reject smoke, FAKE, and unattested tips.
- Optional: `WEB_AUTH_TOKEN` + `OFFICIAL_REQUIRES_WEB_AUTH=true` for pilot lock-down.

## Models

| Mode | Model |
| --- | --- |
| dry-run | `gpt-4o-mini` |
| official | `gpt-4.1-mini` (≥3 repeats) |

## Layout

- `eval-skills/tasksets/cde-v1/` — shared fixtures for code-debugging skills
- `eval-skills/code-debugging-eval` — skill #1 minimal prompt (`taskSetDir: cde-v1`)
- `eval-skills/code-debugging-eval-checklist` — alternate prompt, same shared `cde-v1` fixtures
- `eval-skills/test-generation-eval` — skill #2 (write assert tests, 6 tasks; adversarial subject-bad)
- `data/imported-skills/` — GitHub / local zip imports (Find/Receive)
- `packages/core` — schema, scoring, skill loader, Docker grade, comparison, CSV
- `apps/worker` — file queue + produce/grade + capture
- `apps/web` — New run / Runs / Comparison / Dashboard / Benefit / Settings

## Smoke without OpenAI

Harness self-check (known-good pass + known-bad fail for every skill dry-run task). GitHub Actions CI runs the same checks on every push/PR (`npm run ci`):

```bat
npm run smoke:skills
```

Paired Comparison smoke (writes `data/results/eval_smoke_*` + baseline/candidate results):

```bat
npm run smoke:paired
```

Official adoption smoke (fixture scores → Comparison PASS→Benefit USE and FAIL→DO NOT USE, no OpenAI):

```bat
npm run smoke:official
```

Official export-gate smoke (Benefit / run CSV / Comparison CSV / archive: PASS/FAIL only; blocks dry-run, smoke, FAKE_PRODUCE, unattested):

```bat
npm run smoke:export
```

Worker smoke with fake produce:

```bat
set FAKE_PRODUCE=known-good
set ALLOW_HOST_GRADE=1
npm run dev -w @skillevalator/worker
```

(`ALLOW_HOST_GRADE=1` is honored only with `FAKE_PRODUCE=known-good`. Live produce always uses Docker grade.)
