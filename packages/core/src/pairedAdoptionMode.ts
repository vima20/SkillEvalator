/** Client-safe paired mode resolution (no Node / fs imports). */
export type EvalRunMode = "dry-run" | "official";

/**
 * Adoption-facing paired mode: tip legs beat stale comparison.json / meta
 * (official tip wins; else dry-run tip; else comparison.mode; else meta).
 */
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
