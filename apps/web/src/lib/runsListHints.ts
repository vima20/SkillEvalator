/** Candidate tip/smoke hints on the Runs history list (matches Benefit demotion). */
export type RunsListLegHint = "tip" | "superseded" | "smoke" | "waiting";

export function candidateRunsListHint(opts: {
  runId: string;
  role?: string;
  fakeProduce?: boolean;
  evaluationId?: string;
  tipCandidateRunId?: string | null;
}): RunsListLegHint | null {
  if (opts.role !== "candidate") return null;
  if (opts.fakeProduce) return "smoke";
  if (!opts.evaluationId) return null;
  if (!opts.tipCandidateRunId) return "waiting";
  if (opts.tipCandidateRunId !== opts.runId) return "superseded";
  return "tip";
}

export function runsListHintLabel(hint: RunsListLegHint | null): string | null {
  switch (hint) {
    case "tip":
      return "tip";
    case "superseded":
      return "superseded";
    case "smoke":
      return "smoke";
    case "waiting":
      return "waiting tip";
    default:
      return null;
  }
}
