import {
  buildBenefitReport,
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

/** Benefit with paired Comparison gate (USE / 5★ needs PASS). */
export function buildBenefitReportForRun(result: RunResult): BenefitReport {
  return buildBenefitReportBundle(result).report;
}

/** Report + comparison for export gates that must re-check PASS. */
export function buildBenefitReportBundle(result: RunResult): {
  report: BenefitReport;
  comparison: RunComparison | null;
  meta: EvaluationMeta | null;
  tipCandidateRunId: string | null;
  tipBaselineRunId: string | null;
  baseline: RunResult | null;
  candidate: RunResult | null;
} {
  const packed = result.evaluationId
    ? loadEvaluationComparison(result.evaluationId)
    : null;
  const comparison = packed?.comparison ?? null;
  const meta = packed?.meta ?? null;
  return {
    report: buildBenefitReport(result, { comparison }),
    comparison,
    meta,
    tipCandidateRunId: resolveTipCandidateRunId({ comparison, meta }),
    tipBaselineRunId: packed ? resolveTipBaselineRunId(packed) : null,
    baseline: packed?.baseline ?? null,
    candidate: packed?.candidate ?? null,
  };
}
