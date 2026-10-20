import { DIFF_STRONG_MAX, PASS_SCORE_FLOOR } from "./diffScore.js";

export function meanScores(scores: Array<number | null>): number | null {
  const nums = scores.filter(
    (s): s is number => typeof s === "number" && Number.isFinite(s),
  );
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
  return typeof score === "number" && score >= PASS_SCORE_FLOOR;
}

/** taskIds-based soft-pass counts (missing rows count as not passed). */
export function taskScorecardPassCounts(
  taskIds: string[],
  perTask: TaskScorecardRow[],
): { passed: number; total: number; failedTaskIds: string[] } {
  const byId = new Map(perTask.map((t) => [t.taskId, t]));
  const total = taskIds.length;
  const failedTaskIds = taskIds.filter(
    (id) => !taskPassedSoft(byId.get(id)?.score),
  );
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
 * finite score — null/NaN must not launder into PASS / USE. When runScore is
 * also provided, it must match mean(perTask.score) within RUN_AGGREGATE_SCORE_EPS.
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

  if (opts?.requireFiniteScores) {
    for (const row of perTask) {
      if (!declared.has(row.taskId)) continue;
      if (typeof row.score !== "number" || !Number.isFinite(row.score)) {
        issues.push(
          `${prefix}perTask[${row.taskId}] score is missing or non-finite`.trim(),
        );
      }
    }
  }

  const runScore = opts?.runScore;
  if (
    opts?.requireFiniteScores &&
    typeof runScore === "number" &&
    Number.isFinite(runScore) &&
    missing.length === 0 &&
    extra.length === 0 &&
    duplicateRows.size === 0
  ) {
    const mean = meanScores(perTask.map((row) => row.score ?? null));
    if (mean === null) {
      issues.push(`${prefix}perTask mean score is missing`.trim());
    } else if (Math.abs(mean - runScore) > RUN_AGGREGATE_SCORE_EPS) {
      issues.push(
        `${prefix}run score ${runScore.toFixed(3)} ≠ perTask mean ${mean.toFixed(3)}`.trim(),
      );
    }
  }

  return issues;
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
