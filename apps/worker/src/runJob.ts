import fs from "node:fs";
import path from "node:path";
import {
  JobManifest,
  RunResultSchema,
  assertSafeId,
  buildBenefitReport,
  gradeInDocker,
  gradeOnHost,
  loadSkill,
  taskIdsForMode,
  taskPaths,
  meanScores,
  aggregateRepeats,
  normalizeRepeats,
  resolveUnder,
  writeJsonFile,
  type RunResult,
} from "@skillevalator/core";
import { config } from "./config.js";
import { produceArtifact } from "./produce.js";

function toRepoRelative(absPath: string): string {
  return path.relative(config.repoRoot, absPath).split(path.sep).join("/");
}

function useHostGrade(): boolean {
  return (
    config.allowHostGrade && process.env.FAKE_PRODUCE === "known-good"
  );
}

export async function runJob(job: JobManifest): Promise<RunResult> {
  const runId = assertSafeId(job.runId, "runId");
  const startedAt = new Date().toISOString();
  const skill = loadSkill(config.skillsDir, job.evalSkillId);
  const taskIds = taskIdsForMode(skill, job.mode);
  const allowedModels = new Set([config.modelDryRun, config.modelOfficial]);
  const modelId =
    job.modelId ??
    (job.mode === "official" ? config.modelOfficial : config.modelDryRun);
  if (!allowedModels.has(modelId)) {
    throw new Error(`modelId not allowlisted: ${modelId}`);
  }
  const repeats = normalizeRepeats(job.mode, job.repeats);
  const hostGrade = useHostGrade();
  if (config.allowHostGrade && !hostGrade) {
    console.warn(
      "ALLOW_HOST_GRADE ignored without FAKE_PRODUCE=known-good; using Docker grade",
    );
  }

  const resultDir = resolveUnder(config.resultsDir, runId);
  fs.mkdirSync(resultDir, { recursive: true });

  let costUsd = 0;
  const findings: string[] = [];
  const repeatScores: number[] = [];
  const scoresByTask = new Map<string, number[]>();
  const lastByTask = new Map<string, RunResult["perTask"][number]>();
  let stop: "cancelled" | "budget_stop" | null = null;

  const statusPath = path.join(resultDir, "status.json");
  const cancelPath = path.join(config.jobsDir, `${runId}.cancel`);

  try {
    outer: for (let r = 0; r < repeats; r++) {
      if (config.costHardStop && costUsd >= config.costCapUsd) {
        stop = "budget_stop";
        findings.push("cost hard stop");
        break;
      }

      const perTask: RunResult["perTask"] = [];
      for (const taskId of taskIds) {
        if (fs.existsSync(cancelPath)) {
          stop = "cancelled";
          findings.push("cancelled");
          break outer;
        }
        if (config.costHardStop && costUsd >= config.costCapUsd) {
          stop = "budget_stop";
          findings.push("cost hard stop");
          break outer;
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

        const gradeFn = hostGrade ? gradeOnHost : gradeInDocker;
        const grade = gradeFn({
          skillRoot: skill.root,
          taskDir: tp.taskDir,
          targetFile: tp.targetFile,
          artifactPath,
        });

        const ok = grade.exitCode === 0;
        const row: RunResult["perTask"][number] = {
          taskId,
          artifactRef: toRepoRelative(artifactPath),
          expectedRef: toRepoRelative(tp.expectedPath),
          scriptResults: [
            {
              name: "grade",
              exitCode: grade.exitCode,
              summary: grade.summary,
            },
          ],
          score: ok ? 1 : 0,
          status: ok ? "ok" : "failed",
        };
        perTask.push(row);
        lastByTask.set(taskId, row);
        const arr = scoresByTask.get(taskId) ?? [];
        arr.push(ok ? 1 : 0);
        scoresByTask.set(taskId, arr);
      }

      const scores = perTask.map((t) => t.score);
      const m = meanScores(scores);
      if (m !== null) repeatScores.push(m);

      writeJsonFile(statusPath, {
        runId,
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

    const aggregatedPerTask: RunResult["perTask"] = taskIds.map((taskId) => {
      const last = lastByTask.get(taskId);
      const mean = meanScores(scoresByTask.get(taskId) ?? []);
      return {
        taskId,
        artifactRef: last?.artifactRef,
        expectedRef: last?.expectedRef,
        scriptResults: last?.scriptResults ?? [],
        score: mean,
        status: mean === 1 ? "ok" : "failed",
      };
    });

    let status: RunResult["status"];
    if (stop) status = stop;
    else if (agg.score < 1) status = "failed";
    else status = "ok";

    const result = RunResultSchema.parse({
      runId,
      evalSkillId: skill.id,
      evalSkillVersion: skill.version,
      evalSkillGithubUrl: skill.manifest.githubUrl,
      taskSetId: skill.manifest.taskSetId,
      taskIds,
      pipeline: {
        produce: "model",
        grade: hostGrade ? "host_script" : "docker_script",
      },
      modelId,
      decoding: {
        temperature: config.temperature,
        top_p: config.topP,
        seed: config.seed,
      },
      repeats,
      aggregate: "mean",
      scoreSpread: agg.scoreSpread,
      perTask: aggregatedPerTask,
      score: stop ? null : agg.score,
      subscores: {},
      rationale: "",
      findings,
      costUsd,
      latencyMs: Date.now() - Date.parse(startedAt),
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      mode: job.mode,
    });

    writeJsonFile(path.join(resultDir, "result.json"), result);
    writeJsonFile(
      path.join(resultDir, "benefit-report.json"),
      buildBenefitReport(result),
    );
    writeJsonFile(statusPath, {
      runId,
      status: result.status,
      costUsd,
    });
    return result;
  } finally {
    try {
      fs.unlinkSync(cancelPath);
    } catch {
      /* ignore */
    }
  }
}
