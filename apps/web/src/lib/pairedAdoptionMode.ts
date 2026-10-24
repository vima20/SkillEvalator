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
  const { baselineMode, candidateMode } = opts;
  if (baselineMode && candidateMode) {
    if (baselineMode !== candidateMode) {
      return "dry-run";
    }
    return baselineMode;
  }
  if (baselineMode === "official" || candidateMode === "official") {
    return "official";
  }
  if (baselineMode === "dry-run" || candidateMode === "dry-run") {
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
