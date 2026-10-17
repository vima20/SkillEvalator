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
 * Full heal (Settings Refresh ?heal=1 / POST enqueue / Ready stale scan):
 * reclaim dead .running, orphan queued, and orphan active (budget_stop → failed).
 * Do not use on browse/list SSR, preflight poll, Settings first paint, or the
 * early POST /retry gate (use healRunForRead so wind-down stays fail-closed).
 */
export function healOrphanStatuses(): void {
  healAllOrphansFs(jobsDir(), resultsDir(), isPidAlive);
}

/**
 * Dashboard / Runs / Benefit / Comparison / GET /api/runs / GET /api/preflight /
 * Settings SSR + Settings silent poll (no ?heal=1): reclaim dead .running.json
 * + orphan queued / stale .tmp.json.
 * Skips cleanupOrphanRunningStatusFs so orphan budget_stop stays visible
 * until per-run finalizeOrphans (list RunsAutoRefresh / detail / pending
 * after WIND_DOWN_ORPHAN_MS) or Settings Refresh / retry full heal.
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
 * After wind-down timeout / Settings finalize: full per-run heal including
 * orphan budget_stop → failed so Retry is not stuck behind hasLiveJob.
 * POST /retry uses healRunForRead at the gate (not this) so wind-down cannot
 * be skipped by stamping failed before isRetryBudgetStopping.
 */
export function healRunForFinalize(runId: string): void {
  healRunOrphansFs(jobsDir(), resultsDir(), runId, isPidAlive);
}
