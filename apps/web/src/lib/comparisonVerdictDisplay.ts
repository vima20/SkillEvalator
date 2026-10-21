import type { AdoptionConfirmation } from "@skillevalator/core";

/** Tooltip for Benefit / Dashboard CTAs when official PASS is provisional (1/N). */
export const PROVISIONAL_OFFICIAL_PASS_CTA_TITLE =
  "Provisional official PASS — run a second official pair to confirm Benefit USE";

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

/** Benefit list verdict chip — reuse Comparison list label when paired eval is loaded. */
export function benefitListVerdictChipLabel(opts: {
  recommendation: string;
  comparisonListLabel?: string | null;
}): string {
  if (opts.recommendation === "use") return "USE";
  if (opts.recommendation === "do_not_use") return "DO NOT USE";
  const list = opts.comparisonListLabel?.trim();
  if (list && list.length > 0) return list;
  return "INCONCLUSIVE";
}
