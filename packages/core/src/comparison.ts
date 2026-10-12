import type { RunResult } from "./schema.js";

/** Unikie alustava PASS: candidate ≥ baseline + 5 percentage points. */
export const LIFT_PASS_DELTA = 0.05;

export type ComparisonVerdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export type TaskRegression = {
  taskId: string;
  baselineScore: number | null;
  candidateScore: number | null;
  /** candidate − baseline */
  delta: number | null;
  baselineStatus: string;
  candidateStatus: string;
  regression: boolean;
  improvement: boolean;
};

export type ComparisonParity = {
  ok: boolean;
  issues: string[];
};

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
  parity: ComparisonParity;
  perTask: TaskRegression[];
  regressions: number;
  improvements: number;
};

function scoreOrNull(r: RunResult): number | null {
  return typeof r.score === "number" && Number.isFinite(r.score) ? r.score : null;
}

function sameSorted(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

/** Assert Unikie parity: same model/mode/tasks/repeats/decoding for fair lift. */
export function checkComparisonParity(
  baseline: RunResult,
  candidate: RunResult,
): ComparisonParity {
  const issues: string[] = [];
  if (baseline.modelId !== candidate.modelId) {
    issues.push(
      `modelId mismatch: baseline=${baseline.modelId} candidate=${candidate.modelId}`,
    );
  }
  if (baseline.mode !== candidate.mode) {
    issues.push(`mode mismatch: baseline=${baseline.mode} candidate=${candidate.mode}`);
  }
  if (baseline.taskSetId !== candidate.taskSetId) {
    issues.push(
      `taskSetId mismatch: baseline=${baseline.taskSetId} candidate=${candidate.taskSetId}`,
    );
  }
  if (baseline.repeats !== candidate.repeats) {
    issues.push(
      `repeats mismatch: baseline=${baseline.repeats} candidate=${candidate.repeats}`,
    );
  }
  if (!sameSorted(baseline.taskIds, candidate.taskIds)) {
    issues.push("taskIds differ between baseline and candidate");
  }
  if (
    baseline.decoding.temperature !== candidate.decoding.temperature ||
    baseline.decoding.top_p !== candidate.decoding.top_p
  ) {
    issues.push("decoding (temperature/top_p) mismatch");
  }
  if (
    baseline.evaluationId &&
    candidate.evaluationId &&
    baseline.evaluationId !== candidate.evaluationId
  ) {
    issues.push("evaluationId mismatch");
  }
  if ((baseline.role ?? "candidate") !== "baseline") {
    issues.push(`expected baseline.role=baseline, got ${baseline.role ?? "candidate"}`);
  }
  if ((candidate.role ?? "candidate") !== "candidate") {
    issues.push(`expected candidate.role=candidate, got ${candidate.role}`);
  }
  return { ok: issues.length === 0, issues };
}

export function buildTaskRegressions(
  baseline: RunResult,
  candidate: RunResult,
): TaskRegression[] {
  const baseMap = new Map(baseline.perTask.map((t) => [t.taskId, t]));
  const candMap = new Map(candidate.perTask.map((t) => [t.taskId, t]));
  const ids = [
    ...new Set([...baseMap.keys(), ...candMap.keys()]),
  ].sort();

  return ids.map((taskId) => {
    const b = baseMap.get(taskId);
    const c = candMap.get(taskId);
    const baselineScore =
      typeof b?.score === "number" && Number.isFinite(b.score) ? b.score : null;
    const candidateScore =
      typeof c?.score === "number" && Number.isFinite(c.score) ? c.score : null;
    const delta =
      baselineScore !== null && candidateScore !== null
        ? Math.round((candidateScore - baselineScore) * 10_000) / 10_000
        : null;
    return {
      taskId,
      baselineScore,
      candidateScore,
      delta,
      baselineStatus: b?.status ?? "missing",
      candidateStatus: c?.status ?? "missing",
      regression: delta !== null && delta < -0.001,
      improvement: delta !== null && delta > 0.001,
    };
  });
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

  const parity = checkComparisonParity(baseline, candidate);
  const perTask = buildTaskRegressions(baseline, candidate);
  const regressions = perTask.filter((t) => t.regression).length;
  const improvements = perTask.filter((t) => t.improvement).length;

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

  if (!parity.ok) {
    verdict = "INCONCLUSIVE";
    rationale = `Parity check failed — baseline and candidate are not comparable: ${parity.issues.join("; ")}`;
  } else if (
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
    rationale = `Candidate improves on baseline by ${(lift * 100).toFixed(1)} pp (need ≥ ${(LIFT_PASS_DELTA * 100).toFixed(0)} pp). Lift ${lift.toFixed(3)} (candidate ${candScore.toFixed(3)} − baseline ${baseScore.toFixed(3)}). Task deltas: ${improvements} improved, ${regressions} regressed.`;
  } else {
    verdict = "FAIL";
    rationale = `Lift ${lift.toFixed(3)} < ${LIFT_PASS_DELTA} (candidate ${candScore.toFixed(3)} vs baseline ${baseScore.toFixed(3)}). Skill does not clear the Unikie PASS delta. Task deltas: ${improvements} improved, ${regressions} regressed.`;
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
    parity,
    perTask,
    regressions,
    improvements,
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
