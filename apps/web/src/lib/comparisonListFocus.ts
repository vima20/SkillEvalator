/** Smoke plants and dry-run pairs — not live official adoption evidence. */
export function isPilotNoiseEvaluation(opts: {
  smoke?: boolean;
  displayMode: string;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
}): boolean {
  if (opts.smoke === true) return true;
  if (opts.baselineFakeProduce === true) return true;
  if (opts.candidateFakeProduce === true) return true;
  if (opts.displayMode === "dry-run") return true;
  return false;
}
