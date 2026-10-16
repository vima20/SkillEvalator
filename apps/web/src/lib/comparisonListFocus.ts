/** Smoke plants, dry-run, unattested tips, and non-decisive official — not handoff. */
export function isPilotNoiseEvaluation(opts: {
  smoke?: boolean;
  displayMode: string;
  /** Loaded Comparison verdict; null/undefined = still waiting (keep visible). */
  verdict?: string | null;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  /**
   * When tip result exists: require produceAttested=true.
   * Omit / undefined while in-flight (no result yet) so waiting pairs stay visible.
   */
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
  /** True when baseline tip result.json is on disk. */
  baselineHasResult?: boolean;
  /** True when candidate tip result.json is on disk. */
  candidateHasResult?: boolean;
}): boolean {
  if (opts.smoke === true) return true;
  if (opts.baselineFakeProduce === true) return true;
  if (opts.candidateFakeProduce === true) return true;
  if (opts.displayMode === "dry-run") return true;
  // Align list with CSV/archive bar: official without PASS/FAIL is not handoff.
  if (
    opts.displayMode === "official" &&
    opts.verdict === "INCONCLUSIVE"
  ) {
    return true;
  }
  if (
    opts.baselineHasResult === true &&
    opts.baselineProduceAttested !== true
  ) {
    return true;
  }
  if (
    opts.candidateHasResult === true &&
    opts.candidateProduceAttested !== true
  ) {
    return true;
  }
  return false;
}
