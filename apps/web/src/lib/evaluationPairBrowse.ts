import type { AdoptionConfirmation } from "@skillevalator/core";

import {
  benefitPairEvidenceFromPacked,
  type BenefitListPairChip,
} from "@/lib/benefitListHints";
import { comparisonUiFromPacked } from "@/lib/dashboardComparisonMeta";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";

export type PackedEvaluationBrowse = ReturnType<
  typeof loadEvaluationComparison
>;

export type EvaluationPairBrowseEntry = {
  packed: PackedEvaluationBrowse;
  tipCandidateRunId: string | null;
  tipBaselineRunId: string | null;
  pairChip: BenefitListPairChip | null;
  pairBlocked: boolean;
  comparisonMeta: ReturnType<
    typeof comparisonUiFromPacked
  >["comparisonMeta"];
  pairedDisplayMode?: string;
  comparisonProvisional?: AdoptionConfirmation;
};

/** Pair evidence + Comparison list meta from an already-loaded evaluation pack. */
export function evaluationPairBrowseFromPacked(
  packed: PackedEvaluationBrowse,
): EvaluationPairBrowseEntry {
  const tipCandidateRunId = resolveTipCandidateRunId(packed);
  const tipBaselineRunId = resolveTipBaselineRunId(packed);
  const { pairChip, pairBlocked } = benefitPairEvidenceFromPacked({
    tipBaselineRunId,
    tipCandidateRunId,
    metaSmoke: packed.meta?.smoke === true,
    baseline: packed.baseline,
    candidate: packed.candidate,
  });
  const {
    comparisonMeta,
    pairedDisplayMode,
    comparisonProvisional,
  } = comparisonUiFromPacked(packed);
  return {
    packed,
    tipCandidateRunId,
    tipBaselineRunId,
    pairChip,
    pairBlocked,
    comparisonMeta,
    ...(pairedDisplayMode ? { pairedDisplayMode } : {}),
    ...(comparisonProvisional ? { comparisonProvisional } : {}),
  };
}

/** One disk read per evaluationId — shared by Dashboard / Runs list rows. */
export function createEvaluationPairBrowseCache(): {
  get(evaluationId: string): EvaluationPairBrowseEntry;
} {
  const map = new Map<string, EvaluationPairBrowseEntry>();
  return {
    get(evaluationId: string) {
      let entry = map.get(evaluationId);
      if (!entry) {
        entry = evaluationPairBrowseFromPacked(
          loadEvaluationComparison(evaluationId),
        );
        map.set(evaluationId, entry);
      }
      return entry;
    },
  };
}
