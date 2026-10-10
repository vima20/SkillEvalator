import fs from "node:fs";
import path from "node:path";
import {
  JobManifest,
  gradeInDocker,
  gradeOnHost,
  loadSkill,
  taskIdsForMode,
  taskPaths,
  meanScores,
  aggregateRepeats,
  type RunResult,
} from "@skillevalator/core";
import { config } from "./config.js";
import { produceArtifact } from "./produce.js";

function writeJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

export async function runJob(job: JobManifest): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const skill = loadSkill(config.skillsDir, job.evalSkillId);
  const taskIds = taskIdsForMode(skill, job.mode);
  const modelId =
    job.modelId ??
    (job.mode === "official" ? config.modelOfficial : config.modelDryRun);
  const repeats = job.mode === "official" ? Math.max(job.repeats, 3) : job.repeats;

  const resultDir = path.join(config.resultsDir, job.runId);
  fs.mkdirSync(resultDir, { recursive: true });

  let costUsd = 0;
  const findings: string[] = [];
  const repeatScores: number[] = [];
  let lastPerTask: RunResult["perTask"] = [];

  const statusPath = path.join(resultDir, "status.json");

  for (let r = 0; r < repeats; r++) {
    if (config.costHardStop && costUsd >= config.costCapUsd) {
      findings.push("cost hard stop");
      break;
    }

    const perTask: RunResult["perTask"] = [];
    for (const taskId of taskIds) {
      if (fs.existsSync(path.join(config.jobsDir, `${job.runId}.cancel`))) {
        findings.push("cancelled");
        break;
      }
      if (config.costHardStop && costUsd >= config.costCapUsd) {
        findings.push("cost hard stop");
        break;
      }

      const tp = taskPaths(skill, taskId);
      const artifactPath = path.join(
        resultDir,
        "artifacts",
        `r${r}-${taskId}-${tp.targetFile}`,
      );
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });

      let content: string;
      let produceCost = 0;
      if (process.env.FAKE_PRODUCE === "known-good") {
        content = fs.readFileSync(tp.knownGoodPath, "utf8");
      } else {
        const produced = await produceArtifact({
          modelId,
          skillMd: skill.skillMd,
          inputPath: tp.inputPath,
          targetFile: tp.targetFile,
          seed: config.seed + r,
        });
        content = produced.content;
        produceCost = produced.costUsd;
      }
      fs.writeFileSync(artifactPath, content, "utf8");
      costUsd += produceCost;

      const gradeFn = config.allowHostGrade ? gradeOnHost : gradeInDocker;
      const grade = gradeFn({
        skillRoot: skill.root,
        taskDir: tp.taskDir,
        targetFile: tp.targetFile,
        artifactPath,
      });

      const ok = grade.exitCode === 0;
      perTask.push({
        taskId,
        artifactRef: artifactPath,
        expectedRef: tp.expectedPath,
        scriptResults: [{ name: "grade", exitCode: grade.exitCode, summary: grade.summary }],
        score: ok ? 1 : 0,
        status: ok ? "ok" : "failed",
      });
    }

    lastPerTask = perTask;
    const scores = perTask.map((t) => t.score);
    const m = meanScores(scores);
    if (m !== null) repeatScores.push(m);

    writeJson(statusPath, {
      runId: job.runId,
      status: "running",
      repeat: r + 1,
      repeats,
      costUsd,
    });
  }

  const agg =
    repeatScores.length > 0
      ? aggregateRepeats(repeatScores)
      : { score: 0, scoreSpread: 0 };

  const cancelled = findings.includes("cancelled");
  const budget = findings.includes("cost hard stop");

  const result: RunResult = {
    runId: job.runId,
    evalSkillId: skill.id,
    evalSkillVersion: skill.version,
    taskSetId: skill.manifest.taskSetId,
    taskIds,
    pipeline: { produce: "model", grade: "docker_script" },
    modelId,
    decoding: {
      temperature: config.temperature,
      top_p: config.topP,
      seed: config.seed,
    },
    repeats,
    aggregate: "mean",
    scoreSpread: agg.scoreSpread,
    perTask: lastPerTask,
    score: cancelled || budget ? null : agg.score,
    subscores: {},
    rationale: "",
    findings,
    costUsd,
    latencyMs: Date.now() - Date.parse(startedAt),
    status: cancelled ? "cancelled" : budget ? "budget_stop" : "ok",
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: job.mode,
  };

  writeJson(path.join(resultDir, "result.json"), result);
  writeJson(statusPath, { runId: job.runId, status: result.status, costUsd });
  return result;
}
