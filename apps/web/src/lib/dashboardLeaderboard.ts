import { candidateLegKind } from "@/lib/candidateLeg";

/**
 * Whether a completed run belongs on the Overview skill leaderboard.
 * Aligns with Benefit tip demotion: no smoke, no superseded paired legs.
 * Paired rows require a known tip — unknown tip must not inflate the board.
 * Pilot focus (`?focus=pilot`): official tip candidates only (no pair-blocked).
 */
export function includeInDashboardLeaderboard(opts: {
  runId: string;
  role?: string;
  fakeProduce?: boolean;
  produceAttested?: boolean;
  evaluationId?: string;
  /** Healed Comparison tip; null = unpaired tip unknown (paired → exclude). */
  tipCandidateRunId?: string | null;
  mode?: string;
  /** Sibling tip fails produce evidence (same bar as Benefit list). */
  pairBlocked?: boolean;
  /** When true, keep only official tip (no dry-run / unpaired / pair-blocked). */
  pilotFocus?: boolean;
}): boolean {
  const kind = candidateLegKind(opts);
  if (kind !== "tip" && kind !== "single") return false;
  if (opts.pilotFocus) {
    if (opts.mode !== "official") return false;
    if (kind !== "tip") return false;
    if (opts.pairBlocked) return false;
  }
  return true;
}
