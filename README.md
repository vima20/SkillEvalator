# SkillEvalator

Skills-pohjainen AI Evaluator (MVP): **produce (LLM) → Docker grade (vs expected) → score**.

## Quick start

1. Copy `.env.example` → `.env` and set `OPENAI_API_KEY` (optional for `FAKE_PRODUCE` smoke).
2. Install + run:

```bat
start.bat
```

or

```powershell
.\start.ps1
```

Open http://127.0.0.1:30001 (bound to loopback only). Optional `WEB_AUTH_TOKEN` gates `/api/*`; the UI shows an unlock form that sets a cookie.

## Models

| Mode | Model |
| --- | --- |
| dry-run | `gpt-4o-mini` |
| official | `gpt-4.1-mini` (≥3 repeats) |

## Layout

- `eval-skills/code-debugging-eval` — skill #1 (fix buggy JS, 8 tasks)
- `eval-skills/test-generation-eval` — skill #2 (write assert tests, 6 tasks)
- `packages/core` — schema, scoring, skill loader, Docker grade
- `apps/worker` — file queue + produce/grade
- `apps/web` — New run / Runs / Dashboard / Benefit Report

## Smoke without OpenAI

```bat
set FAKE_PRODUCE=known-good
set ALLOW_HOST_GRADE=1
npm run dev -w @skillevalator/worker
```

(`ALLOW_HOST_GRADE=1` is honored only with `FAKE_PRODUCE=known-good`. Live produce always uses Docker grade.)
