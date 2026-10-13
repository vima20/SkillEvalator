import { PASS_SCORE_FLOOR } from "./diffScore.js";
import { OFFICIAL_MIN_REPEATS } from "./job.js";
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

/** Both missing OK (legacy); XOR presence or unequal values → parity issue. */
function pushEnvFieldParity(
  issues: string[],
  field: string,
  opts: { baseline: unknown; candidate: unknown },
): void {
  const bSet = opts.baseline !== undefined;
  const cSet = opts.candidate !== undefined;
  if (bSet !== cSet) {
    issues.push(
      `capture.env.${field} presence mismatch: baseline=${bSet ? "set" : "missing"} candidate=${cSet ? "set" : "missing"}`,
    );
    return;
  }
  if (bSet && cSet && opts.baseline !== opts.candidate) {
    issues.push(
      `capture.env.${field} mismatch: baseline=${String(opts.baseline)} candidate=${String(opts.candidate)}`,
    );
  }
}

/** Trimmed string fields (commit/license/url): empty counts as missing. */
function pushStringFieldParity(
  issues: string[],
  label: string,
  opts: { baseline?: string | null; candidate?: string | null },
): void {
  const b = opts.baseline?.trim() ?? "";
  const c = opts.candidate?.trim() ?? "";
  if (Boolean(b) !== Boolean(c)) {
    issues.push(
      `${label} presence mismatch: baseline=${b ? "set" : "missing"} candidate=${c ? "set" : "missing"}`,
    );
    return;
  }
  if (b && c && b !== c) {
    issues.push(`${label} mismatch: baseline=${b} candidate=${c}`);
  }
}

/** Assert Unikie parity: same model/mode/tasks/repeats/decoding for fair lift. */
export function checkComparisonParity(
  baseline: RunResult,
  candidate: RunResult,
  opts?: { expectedEvalSkillId?: string },
): ComparisonParity {
  const issues: string[] = [];
  if (baseline.evalSkillId !== candidate.evalSkillId) {
    issues.push(
      `evalSkillId mismatch: baseline=${baseline.evalSkillId} candidate=${candidate.evalSkillId}`,
    );
  }
  if (baseline.evalSkillVersion !== candidate.evalSkillVersion) {
    issues.push(
      `evalSkillVersion mismatch: baseline=${baseline.evalSkillVersion} candidate=${candidate.evalSkillVersion}`,
    );
  }
  // Provenance strings: both missing OK (legacy); XOR or unequal → fail.
  pushStringFieldParity(issues, "capture.commit", {
    baseline: baseline.capture?.commit,
    candidate: candidate.capture?.commit,
  });
  pushStringFieldParity(issues, "capture.license", {
    baseline: baseline.capture?.license,
    candidate: candidate.capture?.license,
  });
  pushStringFieldParity(issues, "capture.githubUrl", {
    baseline: baseline.capture?.githubUrl,
    candidate: candidate.capture?.githubUrl,
  });
  const baselineGradeHash = baseline.capture?.env?.gradeHash?.trim() ?? "";
  const candidateGradeHash = candidate.capture?.env?.gradeHash?.trim() ?? "";
  // Pinned/local grade.js drift is invisible to evalSkillVersion on imports.
  // XOR presence: one leg recorded a harness pin and the other did not.
  if (Boolean(baselineGradeHash) !== Boolean(candidateGradeHash)) {
    issues.push(
      `capture.env.gradeHash presence mismatch: baseline=${baselineGradeHash ? "set" : "missing"} candidate=${candidateGradeHash ? "set" : "missing"}`,
    );
  } else if (
    baselineGradeHash &&
    candidateGradeHash &&
    baselineGradeHash !== candidateGradeHash
  ) {
    issues.push(
      `capture.env.gradeHash mismatch: baseline=${baselineGradeHash.slice(0, 12)}… candidate=${candidateGradeHash.slice(0, 12)}…`,
    );
  }
  // Cost/smoke env fields: both missing OK (legacy); XOR or unequal → fail.
  pushEnvFieldParity(issues, "fakeProduce", {
    baseline: baseline.capture?.env?.fakeProduce,
    candidate: candidate.capture?.env?.fakeProduce,
  });
  pushEnvFieldParity(issues, "costCapUsd", {
    baseline: baseline.capture?.env?.costCapUsd,
    candidate: candidate.capture?.env?.costCapUsd,
  });
  pushEnvFieldParity(issues, "costHardStop", {
    baseline: baseline.capture?.env?.costHardStop,
    candidate: candidate.capture?.env?.costHardStop,
  });
  pushEnvFieldParity(issues, "allowHostGrade", {
    baseline: baseline.capture?.env?.allowHostGrade,
    candidate: candidate.capture?.env?.allowHostGrade,
  });
  pushEnvFieldParity(issues, "maxOutputTokens", {
    baseline: baseline.capture?.env?.maxOutputTokens,
    candidate: candidate.capture?.env?.maxOutputTokens,
  });
  pushEnvFieldParity(issues, "temperature", {
    baseline: baseline.capture?.env?.temperature,
    candidate: candidate.capture?.env?.temperature,
  });
  pushEnvFieldParity(issues, "topP", {
    baseline: baseline.capture?.env?.topP,
    candidate: candidate.capture?.env?.topP,
  });
  pushEnvFieldParity(issues, "seed", {
    baseline: baseline.capture?.env?.seed,
    candidate: candidate.capture?.env?.seed,
  });
  pushEnvFieldParity(issues, "grade", {
    baseline: baseline.capture?.env?.grade,
    candidate: candidate.capture?.env?.grade,
  });
  pushEnvFieldParity(issues, "modelDryRun", {
    baseline: baseline.capture?.env?.modelDryRun,
    candidate: candidate.capture?.env?.modelDryRun,
  });
  pushEnvFieldParity(issues, "modelOfficial", {
    baseline: baseline.capture?.env?.modelOfficial,
    candidate: candidate.capture?.env?.modelOfficial,
  });

  // Capture env.grade must agree with the scored pipeline.grade on each leg.
  if (
    baseline.capture?.env?.grade !== undefined &&
    baseline.capture.env.grade !== baseline.pipeline.grade
  ) {
    issues.push(
      `baseline.capture.env.grade ${baseline.capture.env.grade} ≠ pipeline.grade ${baseline.pipeline.grade}`,
    );
  }
  if (
    candidate.capture?.env?.grade !== undefined &&
    candidate.capture.env.grade !== candidate.pipeline.grade
  ) {
    issues.push(
      `candidate.capture.env.grade ${candidate.capture.env.grade} ≠ pipeline.grade ${candidate.pipeline.grade}`,
    );
  }

  const baselinePromptHash = baseline.capture?.promptHash?.trim() ?? "";
  const candidatePromptHash = candidate.capture?.promptHash?.trim() ?? "";
  // Same hash ⇒ candidate likely ran the neutral prompt (empty skillMd legacy).
  if (Boolean(baselinePromptHash) !== Boolean(candidatePromptHash)) {
    issues.push(
      `capture.promptHash presence mismatch: baseline=${baselinePromptHash ? "set" : "missing"} candidate=${candidatePromptHash ? "set" : "missing"}`,
    );
  } else if (
    baselinePromptHash &&
    candidatePromptHash &&
    baselinePromptHash === candidatePromptHash
  ) {
    issues.push(
      `capture.promptHash identical on both legs (${baselinePromptHash.slice(0, 12)}…) — candidate may have used neutral prompt`,
    );
  }

  const baselinePromptKind = baseline.capture?.promptKind;
  const candidatePromptKind = candidate.capture?.promptKind;
  if (
    (baselinePromptKind !== undefined) !== (candidatePromptKind !== undefined)
  ) {
    issues.push(
      `capture.promptKind presence mismatch: baseline=${baselinePromptKind !== undefined ? "set" : "missing"} candidate=${candidatePromptKind !== undefined ? "set" : "missing"}`,
    );
  }
  if (
    baselinePromptKind !== undefined &&
    baselinePromptKind !== "baseline_neutral"
  ) {
    issues.push(
      `baseline.capture.promptKind expected baseline_neutral, got ${baselinePromptKind}`,
    );
  }
  if (
    candidatePromptKind !== undefined &&
    candidatePromptKind !== "skill_md"
  ) {
    issues.push(
      `candidate.capture.promptKind expected skill_md, got ${candidatePromptKind}`,
    );
  }
  const expected = opts?.expectedEvalSkillId;
  if (expected) {
    if (baseline.evalSkillId !== expected) {
      issues.push(
        `baseline.evalSkillId ${baseline.evalSkillId} ≠ evaluation meta ${expected}`,
      );
    }
    if (candidate.evalSkillId !== expected) {
      issues.push(
        `candidate.evalSkillId ${candidate.evalSkillId} ≠ evaluation meta ${expected}`,
      );
    }
  }
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
  if (baseline.decoding.seed !== candidate.decoding.seed) {
    issues.push(
      `decoding.seed mismatch: baseline=${baseline.decoding.seed ?? "none"} candidate=${candidate.decoding.seed ?? "none"}`,
    );
  }
  // Per-leg: scored decoding must match what Capture recorded.
  for (const [label, leg] of [
    ["baseline", baseline],
    ["candidate", candidate],
  ] as const) {
    const env = leg.capture?.env;
    if (!env) continue;
    if (
      env.temperature !== undefined &&
      env.temperature !== leg.decoding.temperature
    ) {
      issues.push(
        `${label}.decoding.temperature ${leg.decoding.temperature} ≠ capture.env.temperature ${env.temperature}`,
      );
    }
    if (env.topP !== undefined && env.topP !== leg.decoding.top_p) {
      issues.push(
        `${label}.decoding.top_p ${leg.decoding.top_p} ≠ capture.env.topP ${env.topP}`,
      );
    }
    if (env.seed !== undefined && env.seed !== leg.decoding.seed) {
      issues.push(
        `${label}.decoding.seed ${leg.decoding.seed ?? "none"} ≠ capture.env.seed ${env.seed}`,
      );
    }
  }
  if (baseline.pipeline.grade !== candidate.pipeline.grade) {
    issues.push(
      `pipeline.grade mismatch: baseline=${baseline.pipeline.grade} candidate=${candidate.pipeline.grade}`,
    );
  }
  {
    const bEval = baseline.evaluationId?.trim() ?? "";
    const cEval = candidate.evaluationId?.trim() ?? "";
    if (Boolean(bEval) !== Boolean(cEval)) {
      issues.push(
        `evaluationId presence mismatch: baseline=${bEval ? "set" : "missing"} candidate=${cEval ? "set" : "missing"}`,
      );
    } else if (bEval && cEval && bEval !== cEval) {
      issues.push(`evaluationId mismatch: baseline=${bEval} candidate=${cEval}`);
    }
  }

  // Capture skillVersion / githubUrl should match scored fields on each leg.
  for (const [label, leg] of [
    ["baseline", baseline],
    ["candidate", candidate],
  ] as const) {
    const capVer = leg.capture?.skillVersion?.trim() ?? "";
    if (capVer && capVer !== leg.evalSkillVersion) {
      issues.push(
        `${label}.capture.skillVersion ${capVer} ≠ evalSkillVersion ${leg.evalSkillVersion}`,
      );
    }
    const capGh = leg.capture?.githubUrl?.trim() ?? "";
    const scoredGh = leg.evalSkillGithubUrl?.trim() ?? "";
    if (capGh && scoredGh && capGh !== scoredGh) {
      issues.push(
        `${label}.capture.githubUrl ≠ evalSkillGithubUrl`,
      );
    }
  }
  if ((baseline.role ?? "candidate") !== "baseline") {
    issues.push(`expected baseline.role=baseline, got ${baseline.role ?? "candidate"}`);
  }
  if ((candidate.role ?? "candidate") !== "candidate") {
    issues.push(`expected candidate.role=candidate, got ${candidate.role}`);
  }
  const baselineCaptureRole = baseline.capture?.role;
  const candidateCaptureRole = candidate.capture?.role;
  if (
    baselineCaptureRole !== undefined &&
    baselineCaptureRole !== (baseline.role ?? "candidate")
  ) {
    issues.push(
      `baseline.capture.role ${baselineCaptureRole} ≠ result.role ${baseline.role ?? "candidate"}`,
    );
  }
  if (
    candidateCaptureRole !== undefined &&
    candidateCaptureRole !== (candidate.role ?? "candidate")
  ) {
    issues.push(
      `candidate.capture.role ${candidateCaptureRole} ≠ result.role ${candidate.role ?? "candidate"}`,
    );
  }

  // modelId must match the mode-pinned Capture env model (not merely allowlist).
  for (const [label, leg] of [
    ["baseline", baseline],
    ["candidate", candidate],
  ] as const) {
    const dry = leg.capture?.env?.modelDryRun?.trim() || undefined;
    const off = leg.capture?.env?.modelOfficial?.trim() || undefined;
    const expected =
      leg.mode === "official" ? off : leg.mode === "dry-run" ? dry : undefined;
    if (expected && leg.modelId !== expected) {
      const field =
        leg.mode === "official" ? "modelOfficial" : "modelDryRun";
      issues.push(
        `${label}.modelId ${leg.modelId} ≠ capture.env.${field} ${expected} for mode ${leg.mode}`,
      );
    } else if (!expected) {
      // Fallback: if only the other slot is set, still reject unknown modelIds.
      const allowed = [dry, off].filter(
        (m): m is string => typeof m === "string" && m.length > 0,
      );
      if (allowed.length > 0 && !allowed.includes(leg.modelId)) {
        issues.push(
          `${label}.modelId ${leg.modelId} not in capture.env allowlist (${allowed.join(", ")})`,
        );
      }
    }
    if (leg.mode === "official" && leg.repeats < OFFICIAL_MIN_REPEATS) {
      issues.push(
        `${label}.repeats ${leg.repeats} < official minimum ${OFFICIAL_MIN_REPEATS}`,
      );
    }
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
  opts?: { expectedEvalSkillId?: string },
): RunComparison {
  const evaluationId =
    baseline.evaluationId ??
    candidate.evaluationId ??
    `pair_${baseline.runId}_${candidate.runId}`;

  const parity = checkComparisonParity(baseline, candidate, opts);
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
  } else if (candScore < PASS_SCORE_FLOOR) {
    verdict = "FAIL";
    rationale = `Candidate score ${candScore.toFixed(3)} is below the soft-pass floor (${PASS_SCORE_FLOOR.toFixed(2)}). Do not adopt.`;
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

/** Prefer newest finishedAt/startedAt; tie-break on runId (desc). */
function newestForRole(
  runs: RunResult[],
  role: "baseline" | "candidate",
): RunResult | null {
  const matched = runs.filter((r) => (r.role ?? "candidate") === role);
  if (matched.length === 0) return null;
  matched.sort((a, b) => {
    const ta = Date.parse(a.finishedAt ?? a.startedAt ?? "") || 0;
    const tb = Date.parse(b.finishedAt ?? b.startedAt ?? "") || 0;
    if (tb !== ta) return tb - ta;
    return b.runId.localeCompare(a.runId);
  });
  return matched[0] ?? null;
}

/**
 * Pair baseline/candidate legs for an evaluationId scan.
 * When retries left multiple legs per role, pick the newest — not readdir order.
 */
export function pairEvaluationRuns(runs: RunResult[]): {
  baseline: RunResult | null;
  candidate: RunResult | null;
} {
  return {
    baseline: newestForRole(runs, "baseline"),
    candidate: newestForRole(runs, "candidate"),
  };
}

export type ComparisonMetaLegs = {
  baselineRunId: string;
  candidateRunId: string;
};

/**
 * Resolve Comparison legs.
 * When evaluation.json exists, use only those runIds — never fill a missing
 * result from older same-evaluationId runs (avoids ghost PASS after retry).
 * Without meta, refuse to invent a pair from a scan (legacy newest-per-role
 * mixing). Callers that still need scan pairing can use pairEvaluationRuns.
 */
export function resolveComparisonLegs(opts: {
  meta: ComparisonMetaLegs | null;
  loadResult: (runId: string) => RunResult | null;
  /** @deprecated Ignored — scan fallback removed to prevent ghost PASS. */
  scanByEvaluationId?: () => RunResult[];
}): {
  baseline: RunResult | null;
  candidate: RunResult | null;
} {
  if (!opts.meta) {
    return { baseline: null, candidate: null };
  }
  return {
    baseline: opts.loadResult(opts.meta.baselineRunId),
    candidate: opts.loadResult(opts.meta.candidateRunId),
  };
}

const DEFAULT_CANCELLABLE = new Set([
  "queued",
  "running",
  "cancel_requested",
]);

/**
 * Sibling run to cancel with a paired leg.
 * When evaluation.json exists: cascade only if runId is a current meta leg.
 * Never unordered readdir-first (avoids killing the live retry child).
 * When meta is missing (crash mid enqueue): at most one other cancellable run.
 */
export function resolvePairedCancelSibling(opts: {
  runId: string;
  role?: string;
  meta: ComparisonMetaLegs | null;
  /** Other runs sharing evaluationId (may include terminal). */
  peers: Array<{ runId: string; role?: string; status?: string }>;
  cancellableStatuses?: Set<string>;
}): string | null {
  const runId = opts.runId;
  const cancellable = opts.cancellableStatuses ?? DEFAULT_CANCELLABLE;

  if (opts.meta) {
    const { baselineRunId, candidateRunId } = opts.meta;
    if (baselineRunId === runId && candidateRunId !== runId) {
      return candidateRunId;
    }
    if (candidateRunId === runId && baselineRunId !== runId) {
      return baselineRunId;
    }
    // Superseded / stale runId not in meta — do not cascade.
    return null;
  }

  const live = opts.peers.filter(
    (p) => p.runId !== runId && cancellable.has(p.status ?? ""),
  );
  if (live.length === 0) return null;
  if (live.length === 1) return live[0]!.runId;

  const wantOpposite =
    opts.role === "baseline"
      ? "candidate"
      : opts.role === "candidate"
        ? "baseline"
        : null;
  if (wantOpposite) {
    const opposite = live.filter((p) => (p.role ?? "") === wantOpposite);
    if (opposite.length === 1) return opposite[0]!.runId;
  }
  // Ambiguous — refuse to guess.
  return null;
}
