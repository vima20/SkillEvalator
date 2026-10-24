import { DIFF_STRONG_MAX, OFFICIAL_USE_SCORE_FLOOR, PASS_SCORE_FLOOR } from "./diffScore.js";
import { isUnitScore, listScorecardTaskIds, type TaskScorecardRow } from "./scoring.js";

/** Per-task adoption quality vs golden expected (grade + diff scoring). */
export type TaskGoldenQuality =
  | "golden"
  | "soft_pass"
  | "below_soft"
  | "missing";

export function taskGoldenQuality(opts: {
  score?: number | null;
  diffRatio?: number | null;
}): TaskGoldenQuality {
  const { score, diffRatio } = opts;
  if (!isUnitScore(score)) return "missing";
  if (score < PASS_SCORE_FLOOR) return "below_soft";
  if (score < OFFICIAL_USE_SCORE_FLOOR) return "soft_pass";
  if (
    typeof diffRatio === "number" &&
    Number.isFinite(diffRatio) &&
    diffRatio > DIFF_STRONG_MAX
  ) {
    return "soft_pass";
  }
  return "golden";
}

export function goldenQualityChip(quality: TaskGoldenQuality): string | null {
  if (quality === "soft_pass") return "below golden";
  if (quality === "below_soft") return "below soft-pass";
  if (quality === "missing") return "no score";
  return null;
}

export function goldenQualityTitle(quality: TaskGoldenQuality): string {
  switch (quality) {
    case "golden":
      return `Near-golden expected (score ≥ ${OFFICIAL_USE_SCORE_FLOOR}, diff ≤ ${(DIFF_STRONG_MAX * 100).toFixed(0)}%)`;
    case "soft_pass":
      return `Tests may pass but output is not near golden expected (official needs ≥ ${OFFICIAL_USE_SCORE_FLOOR} per task)`;
    case "below_soft":
      return `Below exploratory soft-pass floor (${PASS_SCORE_FLOOR})`;
    case "missing":
      return "Task score missing";
  }
}

export function formatDiffRatioPct(diffRatio: number): string {
  return `${(diffRatio * 100).toFixed(1)}%`;
}

export function goldenTaskPassCounts(
  taskIds: string[],
  perTask: Array<TaskScorecardRow & { diffRatio?: number | null }>,
): { goldenPassed: number; softPassed: number; total: number } {
  const byId = new Map(perTask.map((t) => [t.taskId, t]));
  let goldenPassed = 0;
  let softPassed = 0;
  for (const id of listScorecardTaskIds(taskIds, perTask)) {
    const row = byId.get(id);
    const q = taskGoldenQuality({
      score: row?.score,
      diffRatio: row?.diffRatio,
    });
    if (q === "golden") goldenPassed += 1;
    else if (q === "soft_pass") softPassed += 1;
  }
  return { goldenPassed, softPassed, total: taskIds.length };
}
