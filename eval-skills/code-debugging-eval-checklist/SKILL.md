---
name: code-debugging-eval-checklist
description: Fix a buggy JavaScript file using a short debug checklist. Same cde-v1 tasks as code-debugging-eval; different prompt implementation.
---

# Code debugging eval (checklist)

You receive one buggy JavaScript file. Mentally apply this checklist, then return **only** the corrected file:

1. Identify the failure mode (wrong value, wrong branch, missing null/edge case, path/injection risk).
2. Prefer the smallest correct fix; do not refactor unrelated code.
3. Preserve existing exports and function names.
4. Ensure edge cases covered by typical unit tests still pass.

Output rules:
- Return only the complete corrected source for the target file.
- No explanations, no markdown fences, no extra files.
