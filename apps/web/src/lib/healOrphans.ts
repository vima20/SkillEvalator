import { healAllOrphansFs } from "@skillevalator/core";
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

/** Heal orphan queued/running/cancel_requested + reclaim dead .running jobs. */
export function healOrphanStatuses(): void {
  healAllOrphansFs(jobsDir(), resultsDir(), isPidAlive);
}
