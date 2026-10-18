import {
  listEvaluations,
  loadEvaluationComparison,
} from "@/lib/evaluations";
import { evaluationTipPairIsActive } from "@/lib/evaluationTipPair";

/**
 * True when any evaluation still waits for a tip leg that can change.
 * Terminal tip pairs without a Comparison object are not “pending” for
 * auto-refresh (failed/cancelled/budget_stop scorecards stay quiet).
 */
export function hasPendingEvaluations(): boolean {
  return listEvaluations().some((e) => {
    const packed = loadEvaluationComparison(e.evaluationId);
    if (packed.comparison) return false;
    return evaluationTipPairIsActive(packed);
  });
}
