/** Smoke plants, dry-run, and non-decisive official — not adoption handoff rows. */
export function isPilotNoiseEvaluation(opts: {
  smoke?: boolean;
  displayMode: string;
  /** Loaded Comparison verdict; null/undefined = still waiting (keep visible). */
  verdict?: string | null;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
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
  return false;
}
