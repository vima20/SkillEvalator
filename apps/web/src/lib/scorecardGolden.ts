/** UI helpers — re-export core golden scorecard rules (SSR + client). */
export {
  formatDiffRatioPct,
  goldenQualityChip,
  goldenQualityTitle,
  goldenTaskPassCounts,
  taskGoldenQuality,
  type TaskGoldenQuality,
} from "@skillevalator/core/scorecardGolden";

export function goldenTasksListTitle(goldenPassed: number, total: number): string {
  return `Per-task golden: ${goldenPassed}/${total} tasks ≥ 0.99 and diff vs expected ≤ 8% (official adoption bar)`;
}
