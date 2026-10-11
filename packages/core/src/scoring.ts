import { DIFF_STRONG_MAX, PASS_SCORE_FLOOR } from "./diffScore.js";

export function meanScores(scores: Array<number | null>): number | null {
  const nums = scores.filter((s): s is number => typeof s === "number");
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function scoreSpread(scores: number[]): number {
  if (scores.length === 0) return 0;
  const m = meanScores(scores) ?? 0;
  const v = scores.reduce((a, s) => a + (s - m) ** 2, 0) / scores.length;
  return Math.sqrt(v);
}

export type ScoreLabel = "Fail" | "Pass" | "Strong";

export type LabelScoreOpts = {
  scoreSpread?: number;
  /** Mean normalized edit distance vs expected (0 = identical). */
  meanDiffRatio?: number;
};

/**
 * Fail: score null or below pass floor.
 * Pass: grade-level pass (soft score ≥ floor).
 * Strong: near-perfect score, low repeat spread, and small mean diff vs expected.
 */
export function labelForScore(
  score: number | null,
  spreadOrOpts?: number | LabelScoreOpts,
): ScoreLabel {
  const opts: LabelScoreOpts =
    typeof spreadOrOpts === "number"
      ? { scoreSpread: spreadOrOpts }
      : (spreadOrOpts ?? {});

  if (score === null || score < PASS_SCORE_FLOOR) return "Fail";

  // Strong needs an explicit low repeat-spread signal (same as before).
  const spreadOk =
    opts.scoreSpread !== undefined && opts.scoreSpread <= 0.05;
  const diffOk =
    opts.meanDiffRatio === undefined ||
    opts.meanDiffRatio <= DIFF_STRONG_MAX;
  if (score >= 0.99 && spreadOk && diffOk) return "Strong";
  return "Pass";
}

/** Aggregate repeat run scores (mean). */
export function aggregateRepeats(repeatScores: number[]): {
  score: number;
  scoreSpread: number;
} {
  return {
    score: meanScores(repeatScores) ?? 0,
    scoreSpread: scoreSpread(repeatScores),
  };
}
