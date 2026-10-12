import fs from "node:fs";
import path from "node:path";
import {
  JobManifest,
  PASS_SCORE_FLOOR,
  RunResultSchema,
  assertSafeId,
  buildBenefitReport,
  estimateCallCostUsdForCap,
  gradeInDocker,
  gradeOnHost,
  liveRunStatusForProgress,
  loadSkill,
  resolveFinalRunStop,
  taskIdsForMode,
  taskPaths,
  meanScores,
  aggregateRepeats,
  normalizeRepeats,
  resolveUnder,
  scoreFromGradeAndDiff,
  textDiffRatio,
  wouldExceedCostCap,
  writeJsonFile,
  type RunResult,
} from "@skillevalator/core";
import { config } from "./config.js";
import { touchHeartbeat } from "./heartbeat.js";
import { ProduceCancelledError, produceArtifact } from "./produce.js";

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

  const heartbeatTimer = setInterval(() => {
    touchHeartbeat({ busy: true, runId });
  }, 5_000);
  touchHeartbeat({ busy: true, runId });

  try {
    if (fs.existsSync(cancelPath)) {
      stop = "cancelled";
      findings.push("cancelled");
    }

    writeJsonFile(statusPath, {
      runId,
      status: liveRunStatusForProgress({
        stop,
        cancelFilePresent: fs.existsSync(cancelPath),
      }),
      repeat: 0,
      repeats,
      costUsd: 0,
    });

    outer: for (let r = 0; r < repeats; r++) {
      if (stop) break;
      if (fs.existsSync(cancelPath)) {
        stop = "cancelled";
        if (!findings.includes("cancelled")) findings.push("cancelled");
        break;
      }
      if (config.costHardStop && costUsd >= config.costCapUsd) {
        stop = "budget_stop";
        findings.push("cost hard stop");
        break;
      }

      const perTask: RunResult["perTask"] = [];
      for (const taskId of taskIds) {
        touchHeartbeat({ busy: true, runId });
        if (stop) break outer;
        if (fs.existsSync(cancelPath)) {
          stop = "cancelled";
          if (!findings.includes("cancelled")) findings.push("cancelled");
          break outer;
        }
        if (config.costHardStop && costUsd >= config.costCapUsd) {
          stop = "budget_stop";
          if (!findings.includes("cost hard stop")) {
            findings.push("cost hard stop");
          }
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
        const fakeProduce = process.env.FAKE_PRODUCE === "known-good";
        if (fakeProduce) {
          content = fs.readFileSync(tp.knownGoodPath, "utf8");
        } else {
          const nextCallUsd = estimateCallCostUsdForCap(modelId);
          if (
            config.costHardStop &&
            wouldExceedCostCap({
              spentUsd: costUsd,
              nextCallUsd,
              capUsd: config.costCapUsd,
            })
          ) {
            stop = "budget_stop";
            if (!findings.includes("cost hard stop")) {
              findings.push("cost hard stop");
            }
            if (!findings.includes("cost pre-check blocked produce")) {
              findings.push("cost pre-check blocked produce");
            }
            break outer;
          }
          try {
            const produced = await produceArtifact({
              modelId,
              skillMd: skill.skillMd,
              role: job.role ?? "candidate",
              inputPath: tp.inputPath,
              targetFile: tp.targetFile,
              subjectDir: tp.subjectDir,
              seed: config.seed + r,
              cancelPath,
            });
            content = produced.content;
            produceCost = produced.costUsd;
          } catch (e) {
            if (
              e instanceof ProduceCancelledError ||
              fs.existsSync(cancelPath)
            ) {
              stop = "cancelled";
              if (!findings.includes("cancelled")) findings.push("cancelled");
              break outer;
            }
            throw e;
          }
        }
        fs.writeFileSync(artifactPath, content, "utf8");
        costUsd += produceCost;

        if (
          config.costHardStop &&
          costUsd >= config.costCapUsd
        ) {
          stop = "budget_stop";
          if (!findings.includes("cost hard stop")) {
            findings.push("cost hard stop");
          }
          if (!findings.includes("cost cap reached after produce")) {
            findings.push("cost cap reached after produce");
          }
        }

        if (fs.existsSync(cancelPath)) {
          stop = "cancelled";
          if (!findings.includes("cancelled")) findings.push("cancelled");
          break outer;
        }

        const grade = hostGrade
          ? gradeOnHost({
              skillRoot: skill.root,
              taskDir: tp.taskDir,
              targetFile: tp.targetFile,
              artifactPath,
            })
          : await gradeInDocker({
              skillRoot: skill.root,
              taskDir: tp.taskDir,
              targetFile: tp.targetFile,
              artifactPath,
              cancelPath,
            });

        if (
          grade.summary.includes("cancelled during docker grade") ||
          fs.existsSync(cancelPath)
        ) {
          stop = "cancelled";
          if (!findings.includes("cancelled")) findings.push("cancelled");
          break outer;
        }

        const ok = grade.exitCode === 0 && !stop;
        let diffRatio: number | undefined;
        if (ok && fs.existsSync(tp.expectedPath)) {
          try {
            const expected = fs.readFileSync(tp.expectedPath, "utf8");
            diffRatio = textDiffRatio(content, expected);
          } catch {
            diffRatio = undefined;
            if (!findings.includes("expected read failed")) {
              findings.push("expected read failed");
            }
          }
        }
        const soft = scoreFromGradeAndDiff(
          ok,
          diffRatio === undefined ? null : diffRatio,
        );
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
          score: soft,
          status: ok ? "ok" : "failed",
          ...(diffRatio !== undefined ? { diffRatio } : {}),
        };
        perTask.push(row);
        lastByTask.set(taskId, row);
        const arr = scoresByTask.get(taskId) ?? [];
        arr.push(soft);
        scoresByTask.set(taskId, arr);
      }

      if (stop) break;

      const scores = perTask.map((t) => t.score);
      const m = meanScores(scores);
      if (m !== null) repeatScores.push(m);

      writeJsonFile(statusPath, {
        runId,
        status: liveRunStatusForProgress({
          stop,
          cancelFilePresent: fs.existsSync(cancelPath),
        }),
        repeat: r + 1,
        repeats,
        costUsd,
      });
    }

    stop = resolveFinalRunStop({
      stop,
      cancelFilePresent: fs.existsSync(cancelPath),
    });
    if (stop === "cancelled" && !findings.includes("cancelled")) {
      findings.push("cancelled");
    }

    const agg =
      repeatScores.length > 0
        ? aggregateRepeats(repeatScores)
        : { score: 0, scoreSpread: 0 };

    const aggregatedPerTask: RunResult["perTask"] = taskIds.map((taskId) => {
      const last = lastByTask.get(taskId);
      const mean = meanScores(scoresByTask.get(taskId) ?? []);
      let taskStatus: RunResult["perTask"][number]["status"];
      if (stop === "cancelled") taskStatus = "cancelled";
      else if (stop === "budget_stop") taskStatus = "budget_stop";
      else if (mean !== null && mean >= PASS_SCORE_FLOOR) taskStatus = "ok";
      else taskStatus = "failed";
      return {
        taskId,
        artifactRef: last?.artifactRef,
        expectedRef: last?.expectedRef,
        scriptResults: last?.scriptResults ?? [],
        score: stop ? null : mean,
        status: taskStatus,
        ...(last?.diffRatio !== undefined
          ? { diffRatio: last.diffRatio }
          : {}),
      };
    });

    const diffVals = aggregatedPerTask
      .map((t) => t.diffRatio)
      .filter((d): d is number => typeof d === "number");
    const meanDiffRatio =
      diffVals.length > 0
        ? diffVals.reduce((a, b) => a + b, 0) / diffVals.length
        : undefined;

    let status: RunResult["status"];
    if (stop) status = stop;
    else if (agg.score < PASS_SCORE_FLOOR) status = "failed";
    else status = "ok";

    const role = job.role ?? "candidate";
    const result = RunResultSchema.parse({
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
      },
      evaluationId: job.evaluationId,
      role,
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
      subscores: {
        ...(meanDiffRatio !== undefined ? { meanDiffRatio } : {}),
      },
      rationale:
        role === "baseline"
          ? "Baseline run: neutral prompt (no skill SKILL.md)."
          : "",
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
    clearInterval(heartbeatTimer);
    touchHeartbeat();
    try {
      fs.unlinkSync(cancelPath);
    } catch {
      /* ignore */
    }
  }
}
