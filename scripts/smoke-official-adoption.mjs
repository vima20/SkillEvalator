#!/usr/bin/env node
/**
 * Unikie official adoption smoke without OpenAI:
 * fixture scores → Comparison PASS/FAIL → Benefit USE / DO NOT USE.
 * Guards the CI chain that dry-run smoke (INCONCLUSIVE) cannot cover.
 *
 * Usage: npm run smoke:official
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_MIN_REPEATS,
  OFFICIAL_USE_SCORE_FLOOR,
  buildBenefitReport,
  compareBaselineCandidate,
  findRepoRoot,
  gradeOnHost,
  loadSkill,
  resolveDataPaths,
  resolveTrustedScriptsDir,
  taskIdsForMode,
  taskPaths,
  writeJsonFile,
} from "../packages/core/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(path.resolve(__dirname, ".."));
const { skillsDir, resultsDir } = resolveDataPaths(repoRoot);

const skillId = process.argv[2] ?? "code-debugging-eval";
const skill = loadSkill(skillsDir, skillId);
const taskIds = taskIdsForMode(skill, "official");
const stamp = Date.now();
const startedAt = new Date().toISOString();
// Pin to real harness grade.js — forged matching hashes must not PASS.
const gradeHash = resolveTrustedScriptsDir(skill.root).gradeHash?.trim();
if (!gradeHash) {
  console.error("Smoke official failed: trusted grade.js hash unavailable");
  process.exit(1);
}

function fail(msg) {
  console.error(`Smoke official failed: ${msg}`);
  process.exit(1);
}

function scoreArtifact(kind) {
  const perTask = [];
  for (const taskId of taskIds) {
    const tp = taskPaths(skill, taskId);
    const artifactPath =
      kind === "good" ? tp.knownGoodPath : tp.knownBadPath;
    const grade = gradeOnHost({
      skillRoot: skill.root,
      taskDir: tp.taskDir,
      targetFile: tp.targetFile,
      artifactPath,
    });
    const ok = grade.exitCode === 0;
    perTask.push({
      taskId,
      scriptResults: [
        {
          name: "grade",
          exitCode: grade.exitCode,
          summary: grade.summary ?? (ok ? "ok" : "fail"),
        },
      ],
      score: ok ? 1 : 0,
      status: ok ? "ok" : "failed",
      diffRatio: ok ? 0 : 1,
    });
  }
  const scores = perTask.map((t) => t.score).filter((s) => typeof s === "number");
  const mean =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) /
        1000
      : 0;
  return { perTask, score: mean };
}

function buildOfficialResult(opts) {
  const { runId, role, evaluationId, perTask, score } = opts;
  const promptKind = role === "baseline" ? "baseline_neutral" : "skill_md";
  const promptBody =
    role === "baseline"
      ? "neutral-official-smoke-prompt"
      : skill.skillMd.slice(0, 200) || "skill-official-smoke";
  const promptHash = crypto
    .createHash("sha256")
    .update(`${promptKind}:${promptBody}`)
    .digest("hex")
    .slice(0, 16);
  return {
    runId,
    evalSkillId: skill.id,
    evalSkillVersion: skill.version,
    evalSkillGithubUrl: skill.manifest.githubUrl,
    capture: {
      githubUrl: skill.manifest.githubUrl,
      commit: skill.manifest.commit,
      license: skill.manifest.license,
      dependencies: skill.manifest.dependencies,
      skillVersion: skill.version,
      role,
      promptHash,
      promptPreview: promptBody.slice(0, 500),
      promptKind,
      env: {
        // No fakeProduce — official smoke must not hit smoke INCONCLUSIVE path.
        grade: "host_script",
        gradeHash,
        temperature: 0,
        topP: 1,
        seed: 42,
        modelDryRun: "gpt-4o-mini",
        modelOfficial: "gpt-4.1-mini",
        maxOutputTokens: 1024,
        costCapUsd: 5,
        costHardStop: true,
        fakeProduce: false,
        allowHostGrade: true,
      },
      capturedAt: startedAt,
    },
    evaluationId,
    role,
    taskSetId: skill.manifest.taskSetId,
    taskIds,
    pipeline: { produce: "model", grade: "host_script" },
    modelId: "gpt-4.1-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: OFFICIAL_MIN_REPEATS,
    aggregate: "mean",
    scoreSpread: 0,
    perTask,
    score,
    subscores: {},
    rationale:
      role === "baseline"
        ? "Official smoke baseline (known-bad artifacts)."
        : "Official smoke candidate (known-good / soft-pass fixtures).",
    findings: ["smoke-official-adoption"],
    costUsd: 0,
    latencyMs: 1,
    tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    status: "ok",
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: "official",
  };
}

function writePair(evaluationId, baseline, candidate, label) {
  for (const r of [baseline, candidate]) {
    const dir = path.join(resultsDir, r.runId);
    fs.mkdirSync(dir, { recursive: true });
    writeJsonFile(path.join(dir, "capture.json"), r.capture);
    writeJsonFile(path.join(dir, "result.json"), r);
    writeJsonFile(path.join(dir, "status.json"), {
      runId: r.runId,
      status: r.status,
      role: r.role,
      evaluationId,
      costUsd: 0,
    });
  }
  writeJsonFile(path.join(resultsDir, evaluationId, "evaluation.json"), {
    evaluationId,
    evalSkillId: skill.id,
    mode: "official",
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
    createdAt: startedAt,
    smoke: true,
    label,
  });
  const comparison = compareBaselineCandidate(baseline, candidate, {
    expectedEvalSkillId: skill.id,
    expectedEvaluationMode: "official",
    expectedEvaluationId: evaluationId,
    expectedGradeHash: gradeHash,
  });
  writeJsonFile(
    path.join(resultsDir, evaluationId, "comparison.json"),
    comparison,
  );
  const benefit = buildBenefitReport(candidate, { comparison });
  writeJsonFile(
    path.join(resultsDir, candidate.runId, "benefit-report.json"),
    benefit,
  );
  return { comparison, benefit };
}

// --- PASS case: known-bad baseline vs known-good candidate ---
const passEvalId = `eval_smoke_off_pass_${stamp}`;
const passBaseId = `run_smoke_off_base_pass_${stamp}`;
const passCandId = `run_smoke_off_cand_pass_${stamp}`;
const passBaseScores = scoreArtifact("bad");
const passCandScores = scoreArtifact("good");
if (!(passCandScores.score >= OFFICIAL_USE_SCORE_FLOOR)) {
  fail(
    `known-good candidate score ${passCandScores.score} < USE floor ${OFFICIAL_USE_SCORE_FLOOR}`,
  );
}
const passBaseline = buildOfficialResult({
  runId: passBaseId,
  role: "baseline",
  evaluationId: passEvalId,
  ...passBaseScores,
});
const passCandidate = buildOfficialResult({
  runId: passCandId,
  role: "candidate",
  evaluationId: passEvalId,
  ...passCandScores,
});
const pass = writePair(passEvalId, passBaseline, passCandidate, "pass");
console.log(
  "PASS case",
  passEvalId,
  "verdict",
  pass.comparison.verdict,
  "lift",
  pass.comparison.lift,
  "benefit",
  pass.benefit.verdict.recommendation,
);
if (!pass.comparison.parity.ok) {
  fail(`PASS parity: ${pass.comparison.parity.issues.join("; ")}`);
}
if (pass.comparison.verdict !== "PASS") {
  fail(`expected Comparison PASS, got ${pass.comparison.verdict}`);
}
if (pass.benefit.verdict.recommendation !== "use") {
  fail(
    `expected Benefit USE on tip PASS, got ${pass.benefit.verdict.recommendation}`,
  );
}

// --- FAIL case: soft-pass lift but candidate below USE floor ---
const failEvalId = `eval_smoke_off_fail_${stamp}`;
const failBaseId = `run_smoke_off_base_fail_${stamp}`;
const failCandId = `run_smoke_off_cand_fail_${stamp}`;
const softPerTask = taskIds.map((taskId) => ({
  taskId,
  scriptResults: [{ name: "grade", exitCode: 0, summary: "soft" }],
  score: 0.9,
  status: "ok",
  diffRatio: 0.1,
}));
const failBaseline = buildOfficialResult({
  runId: failBaseId,
  role: "baseline",
  evaluationId: failEvalId,
  perTask: softPerTask.map((t) => ({ ...t, score: 0.8 })),
  score: 0.8,
});
const failCandidate = buildOfficialResult({
  runId: failCandId,
  role: "candidate",
  evaluationId: failEvalId,
  perTask: softPerTask,
  score: 0.9,
});
const failOut = writePair(failEvalId, failBaseline, failCandidate, "fail");
console.log(
  "FAIL case",
  failEvalId,
  "verdict",
  failOut.comparison.verdict,
  "lift",
  failOut.comparison.lift,
  "benefit",
  failOut.benefit.verdict.recommendation,
);
if (!failOut.comparison.parity.ok) {
  fail(`FAIL parity: ${failOut.comparison.parity.issues.join("; ")}`);
}
if (failOut.comparison.verdict !== "FAIL") {
  fail(`expected Comparison FAIL (soft-pass below USE floor), got ${failOut.comparison.verdict}`);
}
if (failOut.benefit.verdict.recommendation !== "do_not_use") {
  fail(
    `expected Benefit DO NOT USE on tip FAIL, got ${failOut.benefit.verdict.recommendation}`,
  );
}

console.log("Smoke official adoption OK");
