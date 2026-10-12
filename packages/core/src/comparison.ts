import type { RunResult } from "./schema.js";

/** Unikie alustava PASS: candidate ≥ baseline + 5 percentage points. */
export const LIFT_PASS_DELTA = 0.05;

export type ComparisonVerdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export type RunComparison = {
  evaluationId: string;
  baselineRunId: string;
  candidateRunId: string;
  evalSkillId: string;
  taskSetId: string;
  mode: RunResult["mode"];
  modelId: string;
  baselineScore: number | null;
  candidateScore: number | null;
  /** candidate − baseline (null if either score missing). */
  lift: number | null;
  costUsd: number;
  latencyMs: number;
  verdict: ComparisonVerdict;
  rationale: string;
  baselineStatus: RunResult["status"];
  candidateStatus: RunResult["status"];
  capture: RunResult["capture"];
};

function scoreOrNull(r: RunResult): number | null {
  return typeof r.score === "number" && Number.isFinite(r.score) ? r.score : null;
}

/**
 * Compare a baseline (no skill / neutral prompt) run to a candidate skill run.
 * Both must share the same evaluationId, taskSet, mode, and model.
 */
export function compareBaselineCandidate(
  baseline: RunResult,
  candidate: RunResult,
): RunComparison {
  const evaluationId =
    baseline.evaluationId ??
    candidate.evaluationId ??
    `pair_${baseline.runId}_${candidate.runId}`;

  const baseScore = scoreOrNull(baseline);
  const candScore = scoreOrNull(candidate);
  const lift =
    baseScore !== null && candScore !== null
      ? Math.round((candScore - baseScore) * 10_000) / 10_000
      : null;

  const costUsd =
    Math.round((baseline.costUsd + candidate.costUsd) * 1_000_000) / 1_000_000;
  const latencyMs = baseline.latencyMs + candidate.latencyMs;

  let verdict: ComparisonVerdict = "INCONCLUSIVE";
  let rationale: string;

  if (
    baseline.status === "cancelled" ||
    candidate.status === "cancelled" ||
    baseline.status === "budget_stop" ||
    candidate.status === "budget_stop"
  ) {
    verdict = "INCONCLUSIVE";
    rationale = `Run incomplete (baseline ${baseline.status}, candidate ${candidate.status}). Re-run the paired evaluation before adoption.`;
  } else if (baseScore === null || candScore === null || lift === null) {
    verdict = "INCONCLUSIVE";
    rationale =
      "Missing scores — cannot compute lift. Ensure both baseline and candidate finished with a score.";
  } else if (candScore < 0.8) {
    verdict = "FAIL";
    rationale = `Candidate score ${candScore.toFixed(3)} is below the soft-pass floor (0.80). Do not adopt.`;
  } else if (lift >= LIFT_PASS_DELTA) {
    verdict = "PASS";
    rationale = `Candidate improves on baseline by ${(lift * 100).toFixed(1)} pp (need ≥ ${(LIFT_PASS_DELTA * 100).toFixed(0)} pp). Lift ${lift.toFixed(3)} (candidate ${candScore.toFixed(3)} − baseline ${baseScore.toFixed(3)}).`;
  } else {
    verdict = "FAIL";
    rationale = `Lift ${lift.toFixed(3)} < ${LIFT_PASS_DELTA} (candidate ${candScore.toFixed(3)} vs baseline ${baseScore.toFixed(3)}). Skill does not clear the Unikie PASS delta.`;
  }

  return {
    evaluationId,
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
    evalSkillId: candidate.evalSkillId,
    taskSetId: candidate.taskSetId,
    mode: candidate.mode,
    modelId: candidate.modelId,
    baselineScore: baseScore,
    candidateScore: candScore,
    lift,
    costUsd,
    latencyMs,
    verdict,
    rationale,
    baselineStatus: baseline.status,
    candidateStatus: candidate.status,
    capture: candidate.capture,
  };
}

/** Pick baseline + candidate from a list of runs that share evaluationId. */
export function pairEvaluationRuns(runs: RunResult[]): {
  baseline: RunResult | null;
  candidate: RunResult | null;
} {
  const baseline =
    runs.find((r) => (r.role ?? "candidate") === "baseline") ?? null;
  const candidate =
    runs.find((r) => (r.role ?? "candidate") === "candidate") ?? null;
  return { baseline, candidate };
}
