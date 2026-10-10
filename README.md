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

Open http://localhost:3000

## Models

| Mode | Model |
| --- | --- |
| dry-run | `gpt-4o-mini` |
| official | `gpt-4.1-mini` (≥3 repeats) |

## Layout

- `eval-skills/code-debugging-eval` — skill #1 (8 tasks, gold, grade script)
- `packages/core` — schema, scoring, skill loader, Docker grade
- `apps/worker` — file queue + produce/grade
- `apps/web` — New run / Runs / Dashboard

## Smoke without OpenAI

```bat
set FAKE_PRODUCE=known-good
set ALLOW_HOST_GRADE=1
npm run dev -w @skillevalator/worker
```

(`ALLOW_HOST_GRADE=1` skips Docker for local unit smoke; production path uses Docker.)
