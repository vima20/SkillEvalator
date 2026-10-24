/** Max normalized edit distance for full Strong credit (identical-ish). */
export const DIFF_STRONG_MAX = 0.08;

/** Below this soft score a task/run is treated as Fail. */
export const PASS_SCORE_FLOOR = 0.8;

/**
 * Official Benefit USE + official Comparison PASS floor.
 * Soft-pass (PASS_SCORE_FLOOR) is weaker — grade can pass while output drifts.
 */
export const OFFICIAL_USE_SCORE_FLOOR = 0.99;

/** Normalized Levenshtein distance in [0, 1] for already-sliced windows. */
function windowDiffRatio(left: string, right: string): number {
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
 * Normalized Levenshtein distance in [0, 1] (0 = identical).
 * Caps work for large files via length-limited windows, but takes the
 * max of prefix, suffix, middle, and length mismatch so identical head+tail
 * cannot hide a divergent mid-span (or length) as a perfect match.
 */
export function textDiffRatio(a: string, b: string, maxChars = 8_000): number {
  const aFull = a.replace(/\r\n/g, "\n");
  const bFull = b.replace(/\r\n/g, "\n");
  if (aFull === bFull) return 0;

  const prefix = windowDiffRatio(
    aFull.slice(0, maxChars),
    bFull.slice(0, maxChars),
  );

  const truncated =
    aFull.length > maxChars || bFull.length > maxChars;
  if (!truncated) return prefix;

  const suffix = windowDiffRatio(
    aFull.slice(-maxChars),
    bFull.slice(-maxChars),
  );
  const midStartA = Math.max(0, Math.floor((aFull.length - maxChars) / 2));
  const midStartB = Math.max(0, Math.floor((bFull.length - maxChars) / 2));
  const middle = windowDiffRatio(
    aFull.slice(midStartA, midStartA + maxChars),
    bFull.slice(midStartB, midStartB + maxChars),
  );
  const lengthMismatch =
    Math.abs(aFull.length - bFull.length) /
    Math.max(aFull.length, bFull.length, 1);

  return Math.max(prefix, suffix, middle, lengthMismatch);
}

/**
 * Soft score from grade pass/fail + closeness to golden expected output.
 * Fail → 0. Pass without diff → PASS_SCORE_FLOOR (tests passed, no golden).
 * Pass with diff ≤ DIFF_STRONG_MAX → OFFICIAL_USE_SCORE_FLOOR…1.0 (near-golden).
 * Pass with larger diff → PASS_SCORE_FLOOR…(USE−ε) — tests ok but fix drifts.
 */
export function scoreFromGradeAndDiff(
  gradeOk: boolean,
  diffRatio: number | null,
): number {
  if (!gradeOk) return 0;
  if (diffRatio === null || !Number.isFinite(diffRatio)) {
    return PASS_SCORE_FLOOR;
  }
  const d = Math.min(1, Math.max(0, diffRatio));
  if (d <= DIFF_STRONG_MAX) {
    const t = 1 - d / DIFF_STRONG_MAX;
    const score =
      OFFICIAL_USE_SCORE_FLOOR + (1 - OFFICIAL_USE_SCORE_FLOOR) * t;
    return Math.round(score * 1000) / 1000;
  }
  const drift = (d - DIFF_STRONG_MAX) / (1 - DIFF_STRONG_MAX);
  const capBelowUse = OFFICIAL_USE_SCORE_FLOOR - 0.001;
  const score =
    PASS_SCORE_FLOOR + (capBelowUse - PASS_SCORE_FLOOR) * (1 - drift);
  return Math.round(score * 1000) / 1000;
}
