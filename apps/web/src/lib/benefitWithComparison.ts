import {
  buildBenefitReport,
  type BenefitPairPending,
  type BenefitReport,
  type RunComparison,
  type RunResult,
} from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
  type EvaluationMeta,
} from "@/lib/evaluations";
import { evaluationPairPending } from "@/lib/evaluationTipPair";
import { resolveRunDetailEvaluationId } from "@/lib/runDetailEvaluationPack";

/** Benefit with paired Comparison gate (USE / 5★ needs PASS). */
export function buildBenefitReportForRun(
  result: RunResult,
  opts?: { evaluationId?: string | null; runId?: string },
): BenefitReport {
  return buildBenefitReportBundle(result, opts).report;
}

/** Report + comparison for export gates that must re-check PASS. */
export function buildBenefitReportBundle(
  result: RunResult,
  opts?: {
    /** Prefer resolved id (status → job → result). */
    evaluationId?: string | null;
    runId?: string;
    status?: { evaluationId?: string } | null;
  },
): {
  report: BenefitReport;
  comparison: RunComparison | null;
  meta: EvaluationMeta | null;
  tipCandidateRunId: string | null;
  tipBaselineRunId: string | null;
  baseline: RunResult | null;
  candidate: RunResult | null;
  /** Same source as pairHarness / retryAdmission. */
  evaluationId: string | null;
  /**
   * When Comparison is missing: tip still active (`waiting`) or settled
   * without a scorecard (`unavailable`). Undefined when Comparison exists
   * or there is no packed evaluation.
   */
  pairPending?: BenefitPairPending;
} {
  const evaluationId =
    opts?.evaluationId !== undefined
      ? (opts.evaluationId ?? null)
      : opts?.runId
        ? resolveRunDetailEvaluationId({
            runId: opts.runId,
            status: opts.status,
            result,
          })
        : (result.evaluationId ?? null);
  const packed = evaluationId
    ? loadEvaluationComparison(evaluationId)
    : null;
  const comparison = packed?.comparison ?? null;
  const meta = packed?.meta ?? null;
  const tipCandidateRunId = resolveTipCandidateRunId({ comparison, meta });
  const tipBaselineRunId = packed ? resolveTipBaselineRunId(packed) : null;
  const supersededNonTip = Boolean(
    tipCandidateRunId && tipCandidateRunId !== result.runId,
  );
  const pairPending = evaluationPairPending(packed, {
    runId: result.runId,
  });
  return {
    report: buildBenefitReport(result, {
      comparison,
      ...(pairPending ? { pairPending } : {}),
      ...(supersededNonTip && tipCandidateRunId
        ? { tipCandidateRunId }
        : {}),
    }),
    comparison,
    meta,
    tipCandidateRunId,
    tipBaselineRunId,
    baseline: packed?.baseline ?? null,
    candidate: packed?.candidate ?? null,
    evaluationId,
    ...(pairPending ? { pairPending } : {}),
  };
}
