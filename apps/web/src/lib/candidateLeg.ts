/**
 * Shared candidate tip / smoke / superseded classification for
 * Runs, Benefit, Dashboard, and run-detail CTAs.
 */

export type CandidateLegKind =
  | "tip"
  | "superseded"
  | "smoke"
  | "not_attested"
  | "single"
  | "waiting";

export function candidateLegKind(opts: {
  runId: string;
  role?: string;
  fakeProduce?: boolean;
  /** Live worker pin — missing/false demotes like smoke for adoption UI. */
  produceAttested?: boolean;
  evaluationId?: string;
  tipCandidateRunId?: string | null;
}): CandidateLegKind | null {
  if (opts.role !== "candidate") return null;
  if (opts.fakeProduce) return "smoke";
  if (opts.produceAttested !== true) return "not_attested";
  if (!opts.evaluationId) return "single";
  if (!opts.tipCandidateRunId) return "waiting";
  if (opts.tipCandidateRunId !== opts.runId) return "superseded";
  return "tip";
}

/** Smoke harness, unattested plants, and superseded retries — demote / hide. */
export function isPilotNoiseLeg(kind: CandidateLegKind | null): boolean {
  return (
    kind === "smoke" || kind === "superseded" || kind === "not_attested"
  );
}

/**
 * Runs / Benefit pilot focus: hide smoke, not_attested, superseded,
 * FAKE_PRODUCE, and dry-run. Active rows without a result stay visible (ops).
 */
export function includeInPilotFocusRun(opts: {
  kind: CandidateLegKind | null;
  mode?: string;
  fakeProduce?: boolean;
  produceAttested?: boolean;
  hasResult: boolean;
}): boolean {
  if (opts.fakeProduce) return false;
  if (opts.hasResult && opts.produceAttested !== true) return false;
  if (isPilotNoiseLeg(opts.kind)) return false;
  if (opts.hasResult && opts.mode === "dry-run") return false;
  return true;
}

export function candidateLegLabel(kind: CandidateLegKind): string {
  switch (kind) {
    case "tip":
      return "tip candidate";
    case "superseded":
      return "superseded";
    case "smoke":
      return "smoke (FAKE_PRODUCE)";
    case "not_attested":
      return "not attested";
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
    case "not_attested":
      return 4;
    case "smoke":
      return 5;
  }
}
