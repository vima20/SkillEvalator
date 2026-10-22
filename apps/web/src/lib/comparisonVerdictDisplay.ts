import type { AdoptionConfirmation } from "@skillevalator/core";

/** Tooltip for Benefit / Dashboard CTAs when official PASS is provisional (1/N). */
export const PROVISIONAL_OFFICIAL_PASS_CTA_TITLE =
  "Provisional official PASS — run a second official pair to confirm Benefit USE";

/** Official adoption still awaiting confirming pair(s) on disk. */
export function isAdoptionConfirmationPending(
  confirm?: AdoptionConfirmation | null,
): boolean {
  return (
    confirm !== undefined &&
    confirm !== null &&
    confirm.step < confirm.required
  );
}

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
    isAdoptionConfirmationPending(confirm)
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

/** CSS tone for Comparison list verdict chips (not raw PASS when provisional 1/N). */
export function comparisonVerdictChipTone(opts: {
  verdict: string;
  displayMode: string;
  adoptionConfirmation?: AdoptionConfirmation | null;
}): "use" | "do_not_use" | "inconclusive" {
  if (
    isProvisionalOfficialPass({
      verdict: opts.verdict,
      displayMode: opts.displayMode,
      adoptionConfirmation: opts.adoptionConfirmation,
    })
  ) {
    return "inconclusive";
  }
  if (
    opts.displayMode === "official" &&
    opts.verdict === "PASS" &&
    isAdoptionConfirmationPending(opts.adoptionConfirmation)
  ) {
    return "inconclusive";
  }
  if (opts.displayMode === "official" && opts.verdict === "PASS") return "use";
  if (opts.displayMode === "official" && opts.verdict === "FAIL") {
    return "do_not_use";
  }
  return "inconclusive";
}

/** Detail-page verdict banner class (same tone rules as list chips). */
export function comparisonVerdictBannerClass(opts: {
  verdict: string;
  displayMode: string;
  adoptionConfirmation?: AdoptionConfirmation | null;
}): string {
  const tone = comparisonVerdictChipTone(opts);
  if (tone === "use") return "verdict-banner verdict-use";
  if (tone === "do_not_use") return "verdict-banner verdict-do_not_use";
  return "verdict-banner verdict-inconclusive";
}

/** Benefit list chip tone when paired Comparison is on disk. */
export function benefitVerdictChipToneFromComparison(opts: {
  recommendation: string;
  comparison?: {
    verdict: string;
    adoptionConfirmation?: AdoptionConfirmation | null;
  } | null;
  pairedDisplayMode?: string;
}): "use" | "do_not_use" | "inconclusive" {
  if (opts.comparison && opts.pairedDisplayMode) {
    return comparisonVerdictChipTone({
      verdict: opts.comparison.verdict,
      displayMode: opts.pairedDisplayMode,
      adoptionConfirmation: opts.comparison.adoptionConfirmation,
    });
  }
  if (opts.recommendation === "use") return "use";
  if (opts.recommendation === "do_not_use") return "do_not_use";
  return "inconclusive";
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
