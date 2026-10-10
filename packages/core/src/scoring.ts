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

/**
 * Fail: score null or &lt; 1.
 * Pass: perfect mean score.
 * Strong: Pass with low repeat spread (≤ 0.05) when spread is provided.
 */
export function labelForScore(
  score: number | null,
  scoreSpread?: number,
): ScoreLabel {
  if (score === null || score < 1) return "Fail";
  if (scoreSpread !== undefined && scoreSpread <= 0.05) return "Strong";
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
