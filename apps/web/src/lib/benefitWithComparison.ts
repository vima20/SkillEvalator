import {
  buildBenefitReport,
  type BenefitReport,
  type RunComparison,
  type RunResult,
} from "@skillevalator/core";
import { loadEvaluationComparison } from "@/lib/evaluations";

/** Benefit with paired Comparison gate (USE / 5★ needs PASS). */
export function buildBenefitReportForRun(result: RunResult): BenefitReport {
  return buildBenefitReportBundle(result).report;
}

/** Report + comparison for export gates that must re-check PASS. */
export function buildBenefitReportBundle(result: RunResult): {
  report: BenefitReport;
  comparison: RunComparison | null;
} {
  const comparison = result.evaluationId
    ? loadEvaluationComparison(result.evaluationId).comparison
    : null;
  return {
    report: buildBenefitReport(result, { comparison }),
    comparison,
  };
}
