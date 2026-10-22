/**
 * Client-safe copy of @skillevalator/core/pairedAdoptionMode — do not import the
 * core barrel from pilotFocusHref (pulls node:child_process into the client).
 * Keep in sync with packages/core/src/pairedAdoptionMode.ts.
 */
export type EvalRunMode = "dry-run" | "official";

export function pairedEvaluationAdoptionMode(opts: {
  metaMode?: string | null;
  baselineMode?: EvalRunMode;
  candidateMode?: EvalRunMode;
  comparisonMode?: EvalRunMode;
}): EvalRunMode | undefined {
  if (
    opts.baselineMode === "official" ||
    opts.candidateMode === "official"
  ) {
    return "official";
  }
  if (
    opts.baselineMode === "dry-run" ||
    opts.candidateMode === "dry-run"
  ) {
    return "dry-run";
  }
  if (
    opts.comparisonMode === "official" ||
    opts.comparisonMode === "dry-run"
  ) {
    return opts.comparisonMode;
  }
  const meta = typeof opts.metaMode === "string" ? opts.metaMode.trim() : "";
  if (meta === "official" || meta === "dry-run") {
    return meta;
  }
  return undefined;
}
