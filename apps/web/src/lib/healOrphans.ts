import {
  cleanupOrphanQueuedFs,
  cleanupOrphanRunningStatusFs,
} from "@skillevalator/core";
import { jobsDir, resultsDir } from "@/lib/paths";

/** Heal orphan queued/running/cancel_requested statuses before listing runs. */
export function healOrphanStatuses(): void {
  const jobs = jobsDir();
  const results = resultsDir();
  cleanupOrphanQueuedFs(jobs, results);
  cleanupOrphanRunningStatusFs(jobs, results);
}
