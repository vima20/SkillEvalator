import type { AdoptionConfirmation } from "@skillevalator/core";

import {
  comparisonVerdictListLabel,
  isProvisionalOfficialPass,
  PROVISIONAL_OFFICIAL_PASS_CTA_TITLE,
} from "@/lib/comparisonVerdictDisplay";
import { pairedEvalDisplayMode } from "@/lib/pilotFocusHref";

type PackedComparison = {
  meta?: { mode?: string } | null;
  baseline?: { mode?: string } | null;
  candidate?: { mode?: string } | null;
  comparison?: {
    verdict: string;
    adoptionConfirmation?: AdoptionConfirmation | null;
  } | null;
};

/** Verdict chip text for Dashboard / Runs Comparison links (aligns with Comparison list). */
export function comparisonCellMetaFromPacked(
  packed: PackedComparison | null,
): { label: string; title?: string } | null {
  const comparison = packed?.comparison;
  if (!comparison) return null;
  const displayMode =
    pairedEvalDisplayMode({
      metaMode: packed?.meta?.mode,
      baselineMode: packed?.baseline?.mode,
      candidateMode: packed?.candidate?.mode,
    }) ?? "dry-run";
  const label = comparisonVerdictListLabel({
    verdict: comparison.verdict,
    displayMode,
    adoptionConfirmation: comparison.adoptionConfirmation,
  });
  let title: string | undefined;
  if (displayMode === "dry-run") {
    title = "Dry-run — not adoption evidence";
  } else if (
    isProvisionalOfficialPass({
      verdict: comparison.verdict,
      displayMode,
      adoptionConfirmation: comparison.adoptionConfirmation,
    })
  ) {
    title = PROVISIONAL_OFFICIAL_PASS_CTA_TITLE;
  }
  return { label, title };
}
