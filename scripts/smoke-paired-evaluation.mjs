#!/usr/bin/env node
/**
 * Unikie paired-evaluation smoke without OpenAI:
 * known-bad ≈ baseline artifact, known-good ≈ candidate → Comparison lift.
 * Writes evaluation.json + result.json under data/results for audit evidence.
 *
 * Usage: npm run smoke:paired
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareBaselineCandidate,
  findRepoRoot,
  gradeOnHost,
  loadSkill,
  resolveDataPaths,
  taskIdsForMode,
  taskPaths,
  writeJsonFile,
} from "../packages/core/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(path.resolve(__dirname, ".."));
const { skillsDir, resultsDir } = resolveDataPaths(repoRoot);

const skillId = process.argv[2] ?? "code-debugging-eval";
const skill = loadSkill(skillsDir, skillId);
const taskIds = taskIdsForMode(skill, "dry-run");
const evaluationId = `eval_smoke_${Date.now()}`;
const baselineRunId = `run_smoke_base_${Date.now()}`;
const candidateRunId = `run_smoke_cand_${Date.now() + 1}`;
const startedAt = new Date().toISOString();

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

function buildResult(opts) {
  const { runId, role, perTask, score } = opts;
  const promptKind = role === "baseline" ? "baseline_neutral" : "skill_md";
  const promptBody =
    role === "baseline"
      ? "neutral-smoke-prompt"
      : skill.skillMd.slice(0, 200) || "skill-smoke";
  const promptHash = crypto
    .createHash("sha256")
    .update(promptBody)
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
        fakeProduce: true,
        grade: "host_script",
        temperature: 0,
        seed: 42,
      },
      capturedAt: startedAt,
    },
    evaluationId,
    role,
    taskSetId: skill.manifest.taskSetId,
    taskIds,
    pipeline: { produce: "model", grade: "host_script" },
    modelId: "gpt-4o-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: 1,
    aggregate: "mean",
    scoreSpread: 0,
    perTask,
    score,
    subscores: {},
    rationale:
      role === "baseline"
        ? "Smoke baseline (known-bad artifacts)."
        : "Smoke candidate (known-good artifacts).",
    findings: ["smoke-paired-evaluation"],
    costUsd: 0,
    latencyMs: 1,
    tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    status: "ok",
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: "dry-run",
  };
}

const baseScores = scoreArtifact("bad");
const candScores = scoreArtifact("good");
const baseline = buildResult({
  runId: baselineRunId,
  role: "baseline",
  ...baseScores,
});
const candidate = buildResult({
  runId: candidateRunId,
  role: "candidate",
  ...candScores,
});

for (const r of [baseline, candidate]) {
  const dir = path.join(resultsDir, r.runId);
  fs.mkdirSync(dir, { recursive: true });
  writeJsonFile(path.join(dir, "capture.json"), r.capture);
  writeJsonFile(path.join(dir, "result.json"), r);
  writeJsonFile(path.join(dir, "status.json"), {
    runId: r.runId,
    status: r.status,
    costUsd: 0,
  });
}

writeJsonFile(path.join(resultsDir, evaluationId, "evaluation.json"), {
  evaluationId,
  evalSkillId: skill.id,
  mode: "dry-run",
  baselineRunId,
  candidateRunId,
  createdAt: startedAt,
  smoke: true,
});

const comparison = compareBaselineCandidate(baseline, candidate);
writeJsonFile(
  path.join(resultsDir, evaluationId, "comparison.json"),
  comparison,
);

console.log("evaluationId", evaluationId);
console.log("baseline", baselineRunId, "score", baseline.score);
console.log("candidate", candidateRunId, "score", candidate.score);
console.log("verdict", comparison.verdict, "lift", comparison.lift);
console.log("parity", comparison.parity.ok ? "OK" : comparison.parity.issues.join("; "));
console.log(
  `Open /comparison/${evaluationId} after starting the web app.`,
);

if (!comparison.parity.ok) {
  console.error("Smoke failed: parity");
  process.exit(1);
}
// Dry-run + FAKE_PRODUCE must never emit adoption PASS/FAIL.
if (comparison.verdict !== "INCONCLUSIVE") {
  console.error(
    "Smoke failed: expected INCONCLUSIVE (dry-run/smoke is not adoption PASS/FAIL)",
  );
  process.exit(1);
}
if (
  typeof comparison.lift !== "number" ||
  !(comparison.lift > 0) ||
  !(comparison.candidateScore > comparison.baselineScore)
) {
  console.error(
    "Smoke failed: expected candidate score/lift above baseline (known-good vs known-bad)",
  );
  process.exit(1);
}
console.log("Smoke paired OK");
