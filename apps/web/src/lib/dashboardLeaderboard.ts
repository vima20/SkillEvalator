/**
 * Whether a completed run belongs on the Overview skill leaderboard.
 * Aligns with Benefit tip demotion: no smoke, no superseded paired legs.
 */
export function includeInDashboardLeaderboard(opts: {
  runId: string;
  role?: string;
  fakeProduce?: boolean;
  evaluationId?: string;
  /** Healed Comparison tip; null/undefined = unpaired or Comparison not ready. */
  tipCandidateRunId?: string | null;
}): boolean {
  if (opts.role !== "candidate") return false;
  if (opts.fakeProduce === true) return false;
  if (
    opts.evaluationId &&
    opts.tipCandidateRunId &&
    opts.tipCandidateRunId !== opts.runId
  ) {
    return false;
  }
  return true;
}
