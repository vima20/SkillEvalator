/**
 * Whether a completed run belongs on the Overview skill leaderboard.
 * Aligns with Benefit tip demotion: no smoke, no superseded paired legs.
 * Paired rows require a known tip — unknown tip must not inflate the board.
 */
export function includeInDashboardLeaderboard(opts: {
  runId: string;
  role?: string;
  fakeProduce?: boolean;
  evaluationId?: string;
  /** Healed Comparison tip; null = unpaired tip unknown (paired → exclude). */
  tipCandidateRunId?: string | null;
}): boolean {
  if (opts.role !== "candidate") return false;
  if (opts.fakeProduce === true) return false;
  if (opts.evaluationId) {
    if (!opts.tipCandidateRunId) return false;
    if (opts.tipCandidateRunId !== opts.runId) return false;
  }
  return true;
}
