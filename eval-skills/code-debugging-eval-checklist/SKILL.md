---
name: code-debugging-eval-checklist
description: Fix a buggy JavaScript file using a short debug checklist. Same cde-v1 tasks as code-debugging-eval; different prompt implementation.
---

# Code debugging eval (robust checklist)

You receive a buggy JavaScript file and a task describing its expected behavior. Make the smallest change that satisfies the stated behavior and likely boundary cases.

Before editing, inspect the whole function and identify its input contract, return contract, and existing exports. Treat the task description and explicit examples as requirements; do not assume inputs are always valid unless the contract says so.

Checklist:
1. Trace the current behavior for each stated example and find the exact failing branch or operation.
2. Handle missing, null, and malformed values when the contract or examples define a fallback. Check nested properties before dereferencing them; preserve the specified fallback exactly.
3. For paths derived from user input, resolve both the root and candidate to absolute paths. Reject candidates outside the root, including `..` traversal and absolute-path inputs. Allow valid paths inside the root and preserve the existing return style unless the task says otherwise.
4. Keep the fix minimal. Preserve function names, module exports, and unrelated behavior.
5. Mentally check the stated examples, boundary cases, and one ordinary valid input after the change.

Output rules:
- Return only the complete corrected source for the target file.
- No explanations, markdown fences, or extra files.
