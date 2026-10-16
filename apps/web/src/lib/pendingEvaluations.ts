import {
  listEvaluations,
  loadEvaluationComparison,
} from "@/lib/evaluations";

/** True when any evaluation still waits for Comparison (both tip legs). */
export function hasPendingEvaluations(): boolean {
  return listEvaluations().some((e) => {
    const packed = loadEvaluationComparison(e.evaluationId);
    return !packed.comparison;
  });
}
