import {
  cleanupOrphanQueuedFs,
  healAllOrphansFs,
  healOrphanQueuedStatusFs,
  healRunOrphansFs,
  reclaimOrphanRunningJobsFs,
} from "@skillevalator/core";
import { jobsDir, resultsDir } from "@/lib/paths";

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Full heal (Settings / POST enqueue / POST retry): reclaim dead .running,
 * orphan queued, and orphan active (budget_stop/running → failed).
 * Do not use on browse/list SSR — that would end wind-down Cancel early.
 */
export function healOrphanStatuses(): void {
  healAllOrphansFs(jobsDir(), resultsDir(), isPidAlive);
}

/**
 * Dashboard / Runs / Benefit / Comparison index + GET /api/runs list:
 * reclaim dead .running.json + orphan queued / stale .tmp.json.
 * Skips cleanupOrphanRunningStatusFs so orphan budget_stop stays visible
 * until per-run finalizeOrphans (list RunsAutoRefresh / detail / pending
 * after WIND_DOWN_ORPHAN_MS) or Settings/retry full heal.
 */
export function healOrphansForBrowse(): void {
  const jobs = jobsDir();
  const root = resultsDir();
  reclaimOrphanRunningJobsFs(jobs, root, isPidAlive);
  cleanupOrphanQueuedFs(jobs, root);
}

/**
 * Interactive read / cancel: reclaim dead .running.json + orphan queued.
 * Skips healOrphanActiveStatusFs so orphan budget_stop stays cancellable
 * during the wind-down window (POST /cancel + Cancel CTA).
 */
export function healRunForRead(runId: string): void {
  const jobs = jobsDir();
  const root = resultsDir();
  reclaimOrphanRunningJobsFs(jobs, root, isPidAlive);
  healOrphanQueuedStatusFs(jobs, root, runId);
}

/**
 * After wind-down timeout / Settings / retry: full per-run heal including
 * orphan budget_stop → failed so Retry is not stuck behind hasLiveJob.
 */
export function healRunForFinalize(runId: string): void {
  healRunOrphansFs(jobsDir(), resultsDir(), runId, isPidAlive);
}

/** GET path that stamps orphan active status after WIND_DOWN_ORPHAN_MS. */
export function runDetailFinalizeOrphansPath(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}?finalizeOrphans=1`;
}
