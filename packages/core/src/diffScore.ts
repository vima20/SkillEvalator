/** Max normalized edit distance for full Strong credit (identical-ish). */
export const DIFF_STRONG_MAX = 0.08;

/** Below this soft score a task/run is treated as Fail. */
export const PASS_SCORE_FLOOR = 0.8;

/**
 * Normalized Levenshtein distance in [0, 1] (0 = identical).
 * Caps work for large files via length-limited comparison.
 */
export function textDiffRatio(a: string, b: string, maxChars = 8_000): number {
  const left = a.replace(/\r\n/g, "\n").slice(0, maxChars);
  const right = b.replace(/\r\n/g, "\n").slice(0, maxChars);
  if (left === right) return 0;
  const n = left.length;
  const m = right.length;
  if (n === 0) return m === 0 ? 0 : 1;
  if (m === 0) return 1;

  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    const ca = left.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ca === right.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m]! / Math.max(n, m);
}

/**
 * Soft score from grade pass/fail + closeness to expected.
 * Fail → 0. Pass with measured diff → 0.8…1.0 (closer → higher).
 * Pass without a usable diff (null / non-finite) → PASS_SCORE_FLOOR only —
 * missing expected is not treated as identical-to-expected.
 */
export function scoreFromGradeAndDiff(
  gradeOk: boolean,
  diffRatio: number | null,
): number {
  if (!gradeOk) return 0;
  if (diffRatio === null || !Number.isFinite(diffRatio)) return PASS_SCORE_FLOOR;
  const closeness = 1 - Math.min(1, Math.max(0, diffRatio));
  return Math.round((PASS_SCORE_FLOOR + (1 - PASS_SCORE_FLOOR) * closeness) * 1000) /
    1000;
}
