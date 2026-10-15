import {
  candidateLegKind,
  type CandidateLegKind,
} from "@/lib/candidateLeg";

/** Candidate tip/smoke hints on the Runs history list (matches Benefit demotion). */
export type RunsListLegHint = Exclude<CandidateLegKind, "single">;

export function candidateRunsListHint(opts: {
  runId: string;
  role?: string;
  fakeProduce?: boolean;
  produceAttested?: boolean;
  evaluationId?: string;
  tipCandidateRunId?: string | null;
}): RunsListLegHint | null {
  const kind = candidateLegKind(opts);
  if (kind === null || kind === "single") return null;
  return kind;
}

export function runsListHintLabel(hint: RunsListLegHint | null): string | null {
  switch (hint) {
    case "tip":
      return "tip";
    case "superseded":
      return "superseded";
    case "smoke":
      return "smoke";
    case "not_attested":
      return "not attested";
    case "waiting":
      return "waiting tip";
    default:
      return null;
  }
}
