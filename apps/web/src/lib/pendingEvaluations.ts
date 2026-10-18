import {
  listEvaluations,
  loadEvaluationComparison,
} from "@/lib/evaluations";
import { runIsActive } from "@/lib/status";

/**
 * True when any evaluation still waits for a tip leg that can change.
 * Terminal tip pairs without a Comparison object are not “pending” for
 * auto-refresh (failed/cancelled/budget_stop scorecards stay quiet).
 */
export function hasPendingEvaluations(): boolean {
  return listEvaluations().some((e) => {
    const packed = loadEvaluationComparison(e.evaluationId);
    if (packed.comparison) return false;
    const baseHas = Boolean(packed.baseline);
    const candHas = Boolean(packed.candidate);
    // Both legs already have result.json — Comparison may be blocked, but
    // polling will not produce a new tip status.
    if (baseHas && candHas) return false;
    return (
      runIsActive(packed.baseline?.status, baseHas) ||
      runIsActive(packed.candidate?.status, candHas)
    );
  });
}
