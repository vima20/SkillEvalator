/**
 * Shared candidate tip / smoke / superseded classification for
 * Runs, Benefit, Dashboard, and run-detail CTAs.
 */

export type CandidateLegKind =
  | "tip"
  | "superseded"
  | "smoke"
  | "single"
  | "waiting";

export function candidateLegKind(opts: {
  runId: string;
  role?: string;
  fakeProduce?: boolean;
  evaluationId?: string;
  tipCandidateRunId?: string | null;
}): CandidateLegKind | null {
  if (opts.role !== "candidate") return null;
  if (opts.fakeProduce) return "smoke";
  if (!opts.evaluationId) return "single";
  if (!opts.tipCandidateRunId) return "waiting";
  if (opts.tipCandidateRunId !== opts.runId) return "superseded";
  return "tip";
}

/** Smoke harness and superseded retries — demote / hide in pilot focus. */
export function isPilotNoiseLeg(kind: CandidateLegKind | null): boolean {
  return kind === "smoke" || kind === "superseded";
}

export function candidateLegLabel(kind: CandidateLegKind): string {
  switch (kind) {
    case "tip":
      return "tip candidate";
    case "superseded":
      return "superseded";
    case "smoke":
      return "smoke (FAKE_PRODUCE)";
    case "single":
      return "unpaired";
    case "waiting":
      return "waiting for tip";
  }
}

export function candidateLegSortRank(kind: CandidateLegKind): number {
  switch (kind) {
    case "tip":
      return 0;
    case "single":
      return 1;
    case "waiting":
      return 2;
    case "superseded":
      return 3;
    case "smoke":
      return 4;
  }
}
