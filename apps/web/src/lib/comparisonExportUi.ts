/** Client-safe Comparison export hrefs (no @skillevalator/core). */

export const COMPARISON_CSV_DOWNLOAD_TITLE =
  "Per-task deltas; candidateDiffRatio and candidateGoldenQuality columns match Benefit CSV golden rules";

export const PILOT_ARCHIVE_DOWNLOAD_TITLE =
  "Zip tip legs, evaluation, comparison.json, MANIFEST (tip mode, git SHA, candidateTasksGoldenPassed/Total)";

export function comparisonCsvExportHref(evaluationId: string): string {
  return `/api/comparison/${encodeURIComponent(evaluationId)}/csv`;
}

export function pilotArchiveExportHref(evaluationId: string): string {
  return `/api/comparison/${encodeURIComponent(evaluationId)}/archive`;
}

export function comparisonCsvDownloadFilename(evaluationId: string): string {
  return `${evaluationId}-comparison.csv`;
}

export function pilotArchiveDownloadFilename(evaluationId: string): string {
  return `${evaluationId}-pilot-archive.zip`;
}
