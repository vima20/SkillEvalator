import {
  buildBenefitReport,
  type BenefitReport,
  type RunResult,
} from "@skillevalator/core";
import { loadEvaluationComparison } from "@/lib/evaluations";

/** Benefit with paired Comparison gate (USE / 5★ needs PASS). */
export function buildBenefitReportForRun(result: RunResult): BenefitReport {
  const comparison = result.evaluationId
    ? loadEvaluationComparison(result.evaluationId).comparison
    : null;
  return buildBenefitReport(result, { comparison });
}
