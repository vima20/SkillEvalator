import {
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";

export type RunDetailPairHarness = {
  metaSmoke: boolean;
  baselineFakeProduce: boolean;
  candidateFakeProduce: boolean;
  baselineProduceAttested: boolean;
  candidateProduceAttested: boolean;
  baselineRunId: string;
  candidateRunId: string;
};

type PackedForHarness = {
  comparison?: {
    baselineRunId?: string;
    candidateRunId?: string;
  } | null;
  meta?: {
    smoke?: boolean;
    baselineRunId?: string;
    candidateRunId?: string;
  } | null;
  baseline?: {
    capture?: { env?: { fakeProduce?: boolean; produceAttested?: boolean } };
  } | null;
  candidate?: {
    capture?: { env?: { fakeProduce?: boolean; produceAttested?: boolean } };
  } | null;
};

/**
 * SSR + GET /api/runs/[runId] parity for ComparisonHarnessCallouts /
 * benefitCtaHint pairEvidence (must survive poll refresh).
 */
export function runDetailPairHarness(
  packed: PackedForHarness | null | undefined,
): RunDetailPairHarness | null {
  if (!packed?.meta) return null;
  const tipBaselineRunId = resolveTipBaselineRunId(packed);
  const tipCandidateRunId = resolveTipCandidateRunId(packed);
  if (!tipBaselineRunId || !tipCandidateRunId) return null;
  return {
    metaSmoke: packed.meta.smoke === true,
    baselineFakeProduce:
      packed.baseline?.capture?.env?.fakeProduce === true,
    candidateFakeProduce:
      packed.candidate?.capture?.env?.fakeProduce === true,
    baselineProduceAttested:
      packed.baseline?.capture?.env?.produceAttested === true,
    candidateProduceAttested:
      packed.candidate?.capture?.env?.produceAttested === true,
    baselineRunId: tipBaselineRunId,
    candidateRunId: tipCandidateRunId,
  };
}
