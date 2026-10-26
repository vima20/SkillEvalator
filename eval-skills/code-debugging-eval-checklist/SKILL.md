---
name: code-debugging-eval-checklist
description: Fix one buggy JavaScript file by diagnosing the defect and returning only the corrected source.
---

# Code debugging eval (checklist)

You receive one buggy JavaScript starter file. Diagnose the defect from the file and its contract, then return the complete corrected file immediately. Work through the diagnosis silently: do not ask questions, describe your reasoning, add tests, or return a report. Output source code only, with no markdown fences.

Preserve the existing function name, CommonJS exports, and unrelated behavior. Make the smallest correct fix. Before returning, check normal inputs and boundary cases.

For common defects in this evaluator, apply these contracts:

- `sumToN(n)` sums every integer from 1 through `n`, inclusive. Initialize the sum to 0 and loop while `i <= n`, so `sumToN(0)` is 0.
- `displayName(user)` returns the uppercase profile name when present. If `user`, `user.profile`, or `user.profile.name` is missing or falsy, return exactly `"ANONYMOUS"`.
- `safeJoin(root, userPath)` returns `path.resolve(root, userPath)`. Reject a resolved candidate outside the root, including parent traversal, by throwing an Error whose message contains `traversal`. Preserve this implementation shape closely:

```js
const path = require("path");
function safeJoin(root, userPath) {
  const resolved = path.resolve(root, userPath);
  const rootResolved = path.resolve(root) + path.sep;
  if (resolved !== path.resolve(root) && !resolved.startsWith(rootResolved)) {
    throw new Error("path traversal");
  }
  return resolved;
}
module.exports = { safeJoin };
```

Return only the complete corrected source file for the supplied filename. Never include examples, explanations, or code for other files in your answer.
