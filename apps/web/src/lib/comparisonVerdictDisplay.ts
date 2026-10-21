import type { AdoptionConfirmation } from "@skillevalator/core";

/** Provisional official PASS awaiting a second confirming pair. */
export function isProvisionalOfficialPass(opts: {
  verdict?: string | null;
  displayMode?: string;
  adoptionConfirmation?: AdoptionConfirmation | null;
}): boolean {
  const confirm = opts.adoptionConfirmation;
  return (
    opts.displayMode === "official" &&
    opts.verdict === "INCONCLUSIVE" &&
    confirm !== undefined &&
    confirm !== null &&
    confirm.step < confirm.required
  );
}

/** Comparison list chip label (verdict + dry-run + 1/N confirmation). */
export function comparisonVerdictListLabel(opts: {
  verdict: string;
  displayMode: string;
  adoptionConfirmation?: AdoptionConfirmation | null;
}): string {
  if (
    isProvisionalOfficialPass({
      verdict: opts.verdict,
      displayMode: opts.displayMode,
      adoptionConfirmation: opts.adoptionConfirmation,
    })
  ) {
    const c = opts.adoptionConfirmation!;
    return `INCONCLUSIVE · ${c.step}/${c.required}`;
  }
  let label = opts.verdict;
  if (opts.displayMode === "dry-run") label += " · dry-run";
  return label;
}
