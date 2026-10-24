/** Client-safe paired mode resolution (no Node / fs imports). */
export type EvalRunMode = "dry-run" | "official";

/**
 * Adoption-facing paired mode: agreeing tip legs beat stale comparison.json /
 * meta. When both tips are present they must match; mixed legs fail-closed to
 * dry-run. Single tip may still promote official/dry-run while the pair loads.
 */
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
