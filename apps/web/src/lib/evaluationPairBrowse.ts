import type { AdoptionConfirmation, RunResult } from "@skillevalator/core";

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

export type EvaluationPairEvidence = ReturnType<
  typeof benefitPairEvidenceFromPacked
>["pairEvidence"];

/** Comparison / run CSV export gates — tip modes beat stale comparison.json. */
export function pairExportEvidenceFromBrowse(
  entry: EvaluationPairBrowseEntry,
): EvaluationPairEvidence & {
  metaMode?: string;
  baselineMode?: RunResult["mode"];
  candidateMode?: RunResult["mode"];
} {
  const packed = entry.packed;
  return {
    ...entry.pairEvidence,
    ...(packed.meta?.mode ? { metaMode: packed.meta.mode } : {}),
    ...(packed.baseline?.mode
      ? { baselineMode: packed.baseline.mode }
      : {}),
    ...(packed.candidate?.mode
      ? { candidateMode: packed.candidate.mode }
      : {}),
  };
}

/** APIs: one browse pass for export gates (tip modes beat stale comparison.json). */
export function pairExportEvidenceFromPacked(
  packed: PackedEvaluationBrowse,
): ReturnType<typeof pairExportEvidenceFromBrowse> {
  return pairExportEvidenceFromBrowse(evaluationPairBrowseFromPacked(packed));
}

export type EvaluationPairBrowseEntry = {
  packed: PackedEvaluationBrowse;
  tipCandidateRunId: string | null;
  tipBaselineRunId: string | null;
  pairEvidence: EvaluationPairEvidence;
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
  const { pairChip, pairBlocked, pairEvidence } = benefitPairEvidenceFromPacked({
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
    pairEvidence,
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
