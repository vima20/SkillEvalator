# Rubric — code-debugging-eval

| Label | Condition |
| --- | --- |
| Fail | Tests fail, timeout, showstopper, or soft score &lt; 0.8 |
| Pass | All task tests pass (soft score 0.8–0.99; larger diff vs expected lowers score) |
| Strong | Soft score ≥ 0.99, low repeat spread (≤ 0.05), and mean diff vs expected ≤ 8% |

Per-task soft score when tests pass: `0.8 + 0.2 × (1 − diffRatio)` where `diffRatio` is normalized edit distance vs `expected/`. Fail → `0`.

Run score = mean of task scores.
