import { DIFF_STRONG_MAX, PASS_SCORE_FLOOR } from "./diffScore.js";

/** Finite score in the closed unit interval [0, 1]. */
export function isUnitScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

/** Clear English reason when a value is not a unit score (null is not an error here). */
export function unitScoreError(value: unknown, label = "score"): string {
  if (value === null || value === undefined) {
    return `${label} is missing`;
  }
  if (typeof value !== "number") {
    return `${label} must be a finite number in [0, 1] (got ${typeof value})`;
  }
  if (Number.isNaN(value)) {
    return `${label} must be a finite number in [0, 1] (got NaN)`;
  }
  if (value === Number.POSITIVE_INFINITY) {
    return `${label} must be a finite number in [0, 1] (got Infinity)`;
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return `${label} must be a finite number in [0, 1] (got -Infinity)`;
  }
  if (!Number.isFinite(value)) {
    return `${label} must be a finite number in [0, 1] (got ${String(value)})`;
  }
  if (value < 0 || value > 1) {
    return `${label} must be in [0, 1] (got ${value})`;
  }
  return `${label} is invalid`;
}

/**
 * Mean of unit scores. `null` entries are skipped (incomplete tasks).
 * Non-null invalid values throw — never coerced to 0.
 */
export function meanScores(scores: Array<number | null>): number | null {
  const nums: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s === null) continue;
    if (!isUnitScore(s)) {
      throw new Error(unitScoreError(s, `scores[${i}]`));
    }
    nums.push(s);
  }
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export type TaskScorecardRow = {
  taskId: string;
  score?: number | null;
};

/** Max |run.score − mean(perTask)| for status=ok adoption (scoreFromGradeAndDiff uses 3dp). */
export const RUN_AGGREGATE_SCORE_EPS = 0.001;

function taskPassedSoft(score: number | null | undefined): boolean {
  return isUnitScore(score) && score >= PASS_SCORE_FLOOR;
}

/** taskIds-based pass counts (missing rows count as not passed). */
export function taskScorecardPassCounts(
  taskIds: string[],
  perTask: TaskScorecardRow[],
  opts?: { passFloor?: number },
): { passed: number; total: number; failedTaskIds: string[] } {
  const floor = opts?.passFloor ?? PASS_SCORE_FLOOR;
  const byId = new Map(perTask.map((t) => [t.taskId, t]));
  const total = taskIds.length;
  const failedTaskIds = taskIds.filter((id) => {
    const score = byId.get(id)?.score;
    return !isUnitScore(score) || score < floor;
  });
  return { passed: total - failedTaskIds.length, total, failedTaskIds };
}

/** Declared taskIds first, then unknown perTask extras (stable UI order). */
export function listScorecardTaskIds(
  taskIds: string[],
  perTask: Array<{ taskId: string }>,
): string[] {
  const ids = [...taskIds];
  for (const t of perTask) {
    if (!ids.includes(t.taskId)) ids.push(t.taskId);
  }
  return ids;
}

/**
 * Fail-closed scorecard integrity: taskIds ↔ perTask must be a bijection
 * (no empty task set, no duplicates, no missing/extra rows). When
 * requireFiniteScores (status=ok adoption paths), every covered row needs a
 * unit score in [0, 1] — null/NaN/out-of-range must not launder into PASS / USE.
 * When runScore is also provided on that path, it must be a unit score and
 * match mean(perTask.score) within RUN_AGGREGATE_SCORE_EPS.
 */
export function taskScorecardCoverageIssues(
  taskIds: string[],
  perTask: TaskScorecardRow[],
  opts?: {
    requireFiniteScores?: boolean;
    label?: string;
    /** status=ok run-level score — must match perTask mean when finite. */
    runScore?: number | null;
  },
): string[] {
  const prefix = opts?.label ? `${opts.label} ` : "";
  const issues: string[] = [];

  if (taskIds.length === 0) {
    issues.push(`${prefix}taskIds is empty`.trim());
  }

  const declared = new Set<string>();
  const duplicateDeclared = new Set<string>();
  for (const id of taskIds) {
    if (declared.has(id)) duplicateDeclared.add(id);
    declared.add(id);
  }
  if (duplicateDeclared.size > 0) {
    issues.push(
      `${prefix}taskIds contains duplicates: ${[...duplicateDeclared].sort().join(", ")}`.trim(),
    );
  }

  const seen = new Set<string>();
  const duplicateRows = new Set<string>();
  for (const row of perTask) {
    if (seen.has(row.taskId)) duplicateRows.add(row.taskId);
    seen.add(row.taskId);
  }
  if (duplicateRows.size > 0) {
    issues.push(
      `${prefix}perTask duplicate taskId(s): ${[...duplicateRows].sort().join(", ")}`.trim(),
    );
  }

  const missing = [...declared].filter((id) => !seen.has(id)).sort();
  if (missing.length > 0) {
    issues.push(
      `${prefix}perTask missing taskId(s): ${missing.join(", ")}`.trim(),
    );
  }

  const extra = [...seen].filter((id) => !declared.has(id)).sort();
  if (extra.length > 0) {
    issues.push(
      `${prefix}perTask has unknown taskId(s): ${extra.join(", ")}`.trim(),
    );
  }

  for (const row of perTask) {
    if (!declared.has(row.taskId)) continue;
    const s = row.score;
    if (s === null || s === undefined) {
      if (opts?.requireFiniteScores) {
        issues.push(
          `${prefix}perTask[${row.taskId}] score is missing`.trim(),
        );
      }
      continue;
    }
    if (!isUnitScore(s)) {
      issues.push(
        `${prefix}perTask[${row.taskId}] ${unitScoreError(s, "score")}`.trim(),
      );
    }
  }

  const runScore = opts?.runScore;
  if (opts?.requireFiniteScores) {
    if (runScore === null || runScore === undefined) {
      issues.push(`${prefix}run score is missing`.trim());
    } else if (!isUnitScore(runScore)) {
      issues.push(`${prefix}${unitScoreError(runScore, "run score")}`.trim());
    } else if (
      missing.length === 0 &&
      extra.length === 0 &&
      duplicateRows.size === 0
    ) {
      try {
        const mean = meanScores(perTask.map((row) => row.score ?? null));
        if (mean === null) {
          issues.push(`${prefix}perTask mean score is missing`.trim());
        } else if (Math.abs(mean - runScore) > RUN_AGGREGATE_SCORE_EPS) {
          issues.push(
            `${prefix}run score ${runScore.toFixed(3)} ≠ perTask mean ${mean.toFixed(3)}`.trim(),
          );
        }
      } catch (err) {
        issues.push(
          `${prefix}${err instanceof Error ? err.message : "perTask mean score is invalid"}`.trim(),
        );
      }
    }
  }

  return issues;
}

export function scoreSpread(scores: number[]): number {
  if (scores.length === 0) return 0;
  for (let i = 0; i < scores.length; i++) {
    if (!isUnitScore(scores[i])) {
      throw new Error(unitScoreError(scores[i], `scores[${i}]`));
    }
  }
  const m = meanScores(scores);
  if (m === null) return 0;
  const v = scores.reduce((a, s) => a + (s - m) ** 2, 0) / scores.length;
  return Math.sqrt(v);
}

export type ScoreLabel = "Fail" | "Pass" | "Strong";

export type LabelScoreOpts = {
  scoreSpread?: number;
  /** Mean normalized edit distance vs expected (0 = identical). */
  meanDiffRatio?: number;
  /** Worst-task diff vs expected — Strong needs this ≤ DIFF_STRONG_MAX when set. */
  maxDiffRatio?: number;
};

/**
 * Fail: score null, invalid, or below pass floor.
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

  if (score === null || !isUnitScore(score) || score < PASS_SCORE_FLOOR) {
    return "Fail";
  }

  // Strong needs an explicit low repeat-spread signal (same as before).
  const spreadOk =
    opts.scoreSpread !== undefined && opts.scoreSpread <= 0.05;
  const diffOk =
    (opts.meanDiffRatio === undefined ||
      opts.meanDiffRatio <= DIFF_STRONG_MAX) &&
    (opts.maxDiffRatio === undefined ||
      opts.maxDiffRatio <= DIFF_STRONG_MAX);
  if (score >= 0.99 && spreadOk && diffOk) return "Strong";
  return "Pass";
}

/**
 * Aggregate repeat run scores (mean). Empty input → score null (not 0) so
 * missing measurements cannot look like a measured zero.
 */
export function aggregateRepeats(repeatScores: number[]): {
  score: number | null;
  scoreSpread: number;
} {
  for (let i = 0; i < repeatScores.length; i++) {
    if (!isUnitScore(repeatScores[i])) {
      throw new Error(unitScoreError(repeatScores[i], `repeatScores[${i}]`));
    }
  }
  return {
    score: meanScores(repeatScores),
    scoreSpread: scoreSpread(repeatScores),
  };
}
