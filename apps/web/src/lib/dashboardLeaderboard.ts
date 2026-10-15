import { candidateLegKind } from "@/lib/candidateLeg";

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
  const kind = candidateLegKind(opts);
  return kind === "tip" || kind === "single";
}
