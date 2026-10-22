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

export type EvaluationPairBrowseEntry = {
  packed: ReturnType<typeof loadEvaluationComparison>;
  tipCandidateRunId: string | null;
  tipBaselineRunId: string | null;
  pairChip: BenefitListPairChip | null;
  pairBlocked: boolean;
  comparisonMeta: ReturnType<
    typeof comparisonUiFromPacked
  >["comparisonMeta"];
};

/** One disk read per evaluationId — shared by Dashboard / Runs list rows. */
export function createEvaluationPairBrowseCache(): {
  get(evaluationId: string): EvaluationPairBrowseEntry;
} {
  const map = new Map<string, EvaluationPairBrowseEntry>();
  return {
    get(evaluationId: string) {
      let entry = map.get(evaluationId);
      if (!entry) {
        const packed = loadEvaluationComparison(evaluationId);
        const tipCandidateRunId = resolveTipCandidateRunId(packed);
        const tipBaselineRunId = resolveTipBaselineRunId(packed);
        const { pairChip, pairBlocked } = benefitPairEvidenceFromPacked({
          tipBaselineRunId,
          tipCandidateRunId,
          metaSmoke: packed.meta?.smoke === true,
          baseline: packed.baseline,
          candidate: packed.candidate,
        });
        const { comparisonMeta } = comparisonUiFromPacked(packed);
        entry = {
          packed,
          tipCandidateRunId,
          tipBaselineRunId,
          pairChip,
          pairBlocked,
          comparisonMeta,
        };
        map.set(evaluationId, entry);
      }
      return entry;
    },
  };
}
