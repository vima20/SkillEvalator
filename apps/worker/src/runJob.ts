import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  JobManifest,
  PASS_SCORE_FLOOR,
  RunResultSchema,
  assertSafeId,
  buildBenefitReport,
  estimateCallCostUsdForCap,
  maxOutputTokensForRemainingBudget,
  gradeInDocker,
  gradeOnHost,
  liveRunStatusForProgress,
  loadRunResult,
  loadSkill,
  tryProvisionalSkillPin,
  resolveFinalRunStop,
  resolveTrustedScriptsDir,
  taskIdsForMode,
  taskPaths,
  meanScores,
  aggregateRepeats,
  normalizeRepeats,
  resolveUnder,
  readRegularFileUtf8,
  scoreFromGradeAndDiff,
  textDiffRatio,
  tryReadRegularFileUtf8,
  wouldExceedCostCap,
  writeJsonFile,
  type RunCapture,
  type RunResult,
  type TokenUsage,
} from "@skillevalator/core";
import { config } from "./config.js";
import { shouldUseHostGrade } from "./gradeMode.js";
import { touchHeartbeat } from "./heartbeat.js";
import {
  BASELINE_NEUTRAL_PROMPT,
  ProduceCancelledError,
  produceArtifact,
} from "./produce.js";

function emptyTokens(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addTokens(a: TokenUsage, prompt: number, completion: number): TokenUsage {
  const promptTokens = a.promptTokens + Math.max(0, prompt);
  const completionTokens = a.completionTokens + Math.max(0, completion);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function toRepoRelative(absPath: string): string {
  return path.relative(config.repoRoot, absPath).split(path.sep).join("/");
}

function useHostGrade(): boolean {
  return shouldUseHostGrade({
    allowHostGrade: config.allowHostGrade,
    fakeProduce: process.env.FAKE_PRODUCE,
  });
}

function writeSkillSnapshot(opts: {
  resultDir: string;
  skill: ReturnType<typeof loadSkill>;
  role: "baseline" | "candidate";
  startedAt: string;
  job: JobManifest;
  promptHash: string;
  promptKind: "baseline_neutral" | "skill_md";
  modelId?: string;
  repeats?: number;
}): string {
  const snapshotDir = path.join(opts.resultDir, "skill-snapshot");
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(
    path.join(snapshotDir, "SKILL.md"),
    opts.role === "baseline"
      ? `${BASELINE_NEUTRAL_PROMPT}\n`
      : `${opts.skill.skillMd}\n`,
    "utf8",
  );
  writeJsonFile(path.join(snapshotDir, "manifest.json"), {
    ...opts.skill.manifest,
    _snapshot: {
      evalSkillId: opts.skill.id,
      evalSkillVersion: opts.skill.version,
      role: opts.role,
      promptHash: opts.promptHash,
      promptKind: opts.promptKind,
      capturedAt: opts.startedAt,
      ...(opts.job.skillSnapshotFromRunId
        ? { skillSnapshotFromRunId: opts.job.skillSnapshotFromRunId }
        : {}),
    },
  });
  writeJsonFile(path.join(snapshotDir, "job.json"), {
    runId: opts.job.runId,
    evalSkillId: opts.skill.id,
    mode: opts.job.mode,
    modelId: opts.modelId ?? opts.job.modelId,
    repeats: opts.repeats ?? opts.job.repeats,
    role: opts.role,
    evaluationId: opts.job.evaluationId,
    skillSnapshotFromRunId: opts.job.skillSnapshotFromRunId,
    createdAt: opts.job.createdAt,
  });
  return snapshotDir;
}

/** Copy prior run's skill-snapshot before loadSkill so a crash mid-load stays retriable. */
function seedSkillSnapshotFromPrior(opts: {
  resultDir: string;
  priorRunId: string;
  job: JobManifest;
  role: "baseline" | "candidate";
  startedAt: string;
}): boolean {
  const priorSnap = path.join(
    resolveUnder(config.resultsDir, opts.priorRunId),
    "skill-snapshot",
  );
  const dest = path.join(opts.resultDir, "skill-snapshot");
  fs.mkdirSync(dest, { recursive: true });
  let mdOk = false;
  let manOk = false;
  try {
    const srcMd = path.join(priorSnap, "SKILL.md");
    if (fs.existsSync(srcMd)) {
      fs.copyFileSync(srcMd, path.join(dest, "SKILL.md"));
      mdOk = true;
    }
    const srcMan = path.join(priorSnap, "manifest.json");
    if (fs.existsSync(srcMan)) {
      fs.copyFileSync(srcMan, path.join(dest, "manifest.json"));
      manOk = true;
    }
  } catch {
    /* leave partial; writeSkillSnapshot refreshes after load */
  }
  writeJsonFile(path.join(dest, "job.json"), {
    runId: opts.job.runId,
    evalSkillId: opts.job.evalSkillId,
    mode: opts.job.mode,
    modelId: opts.job.modelId,
    repeats: opts.job.repeats,
    role: opts.role,
    evaluationId: opts.job.evaluationId,
    skillSnapshotFromRunId: opts.priorRunId,
    createdAt: opts.job.createdAt,
    seededFrom: opts.priorRunId,
    seededAt: opts.startedAt,
  });
  return mdOk && manOk;
}

/** First-run candidate: pin live skill before loadSkill validation. */
function seedSkillSnapshotFromLive(opts: {
  resultDir: string;
  job: JobManifest;
  role: "baseline" | "candidate";
  startedAt: string;
}): boolean {
  const pin = tryProvisionalSkillPin(config.skillsDirs, opts.job.evalSkillId);
  if (!pin) return false;
  const dest = path.join(opts.resultDir, "skill-snapshot");
  fs.mkdirSync(dest, { recursive: true });
  const skillMd =
    opts.role === "baseline"
      ? `${BASELINE_NEUTRAL_PROMPT}\n`
      : `${pin.skillMd}\n`;
  fs.writeFileSync(path.join(dest, "SKILL.md"), skillMd, "utf8");
  writeJsonFile(path.join(dest, "manifest.json"), {
    ...pin.manifest,
    _snapshot: {
      evalSkillId: pin.id,
      evalSkillVersion: pin.version,
      role: opts.role,
      promptKind:
        opts.role === "baseline" ? "baseline_neutral" : "skill_md",
      capturedAt: opts.startedAt,
      provisional: true,
    },
  });
  writeJsonFile(path.join(dest, "job.json"), {
    runId: opts.job.runId,
    evalSkillId: pin.id,
    mode: opts.job.mode,
    modelId: opts.job.modelId,
    repeats: opts.job.repeats,
    role: opts.role,
    evaluationId: opts.job.evaluationId,
    createdAt: opts.job.createdAt,
    provisional: true,
    seededAt: opts.startedAt,
  });
  return true;
}

export async function runJob(job: JobManifest): Promise<RunResult> {
  const runId = assertSafeId(job.runId, "runId");
  const startedAt = new Date().toISOString();
  const role = job.role ?? "candidate";
  const findings: string[] = [];
  const resultDir = resolveUnder(config.resultsDir, runId);
  fs.mkdirSync(resultDir, { recursive: true });

  // Align UI with .running.json immediately (avoid lingering "queued").
  writeJsonFile(path.join(resultDir, "status.json"), {
    runId,
    status: "running",
    role,
    ...(job.evaluationId ? { evaluationId: job.evaluationId } : {}),
  });

  // Candidate: seed Retry pin before loadSkill (parent snapshot or live tree).
  if (role === "candidate") {
    if (job.skillSnapshotFromRunId) {
      seedSkillSnapshotFromPrior({
        resultDir,
        priorRunId: job.skillSnapshotFromRunId,
        job,
        role,
        startedAt,
      });
    } else {
      seedSkillSnapshotFromLive({
        resultDir,
        job,
        role,
        startedAt,
      });
    }
  }

  let skill = loadSkill(config.skillsDirs, job.evalSkillId);
  const promptKind =
    role === "baseline" ? ("baseline_neutral" as const) : ("skill_md" as const);

  if (job.skillSnapshotFromRunId && role === "candidate") {
    const snapMd = path.join(
      resolveUnder(config.resultsDir, job.skillSnapshotFromRunId),
      "skill-snapshot",
      "SKILL.md",
    );
    const locked = tryReadRegularFileUtf8(snapMd);
    if (locked == null) {
      throw new Error(
        fs.existsSync(snapMd)
          ? `skill snapshot invalid for ${job.skillSnapshotFromRunId} (not a readable regular file)`
          : `skill snapshot missing for ${job.skillSnapshotFromRunId}`,
      );
    }
    skill = { ...skill, skillMd: locked };
    findings.push(
      `skill md locked from snapshot of ${job.skillSnapshotFromRunId}`,
    );
    // Prefer snapshot manifest (written even when result.json never landed —
    // cancel/fail/budget_stop mid-run). Fallback to prior result.json.
    const snapManifestPath = path.join(
      resolveUnder(config.resultsDir, job.skillSnapshotFromRunId),
      "skill-snapshot",
      "manifest.json",
    );
    let pinnedVersion: string | undefined;
    try {
      const snapManifest = JSON.parse(
        readRegularFileUtf8(snapManifestPath, "skill snapshot manifest"),
      ) as { _snapshot?: { evalSkillVersion?: string } };
      const v = snapManifest._snapshot?.evalSkillVersion;
      if (typeof v === "string" && v.trim()) pinnedVersion = v.trim();
    } catch {
      /* fall through to result.json */
    }
    if (!pinnedVersion) {
      const prior = loadRunResult(
        config.resultsDir,
        job.skillSnapshotFromRunId,
      );
      if (prior?.evalSkillVersion?.trim()) {
        pinnedVersion = prior.evalSkillVersion.trim();
      }
    }
    if (!pinnedVersion) {
      throw new Error(
        `skill snapshot version missing for ${job.skillSnapshotFromRunId} (no _snapshot.evalSkillVersion or result.json)`,
      );
    }
    if (pinnedVersion !== skill.version) {
      throw new Error(
        `skill/fixtures version drifted since snapshot ${job.skillSnapshotFromRunId}: was ${pinnedVersion}, live ${skill.version}`,
      );
    }
  }

  const instructionForCapture =
    role === "baseline"
      ? BASELINE_NEUTRAL_PROMPT
      : skill.skillMd.trim() || BASELINE_NEUTRAL_PROMPT;
  const promptHash = crypto
    .createHash("sha256")
    .update(instructionForCapture)
    .digest("hex")
    .slice(0, 16);
  const promptPreview = instructionForCapture.slice(0, 500);

  // Pin SKILL.md + evalSkillVersion before model allowlist / repeats so a
  // fail after claim still leaves a candidate Retry lock (not 409 orphan).
  writeSkillSnapshot({
    resultDir,
    skill,
    role,
    startedAt,
    job,
    promptHash,
    promptKind,
  });

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

  // Refresh job.json now that model/repeats are resolved.
  writeSkillSnapshot({
    resultDir,
    skill,
    role,
    startedAt,
    job,
    promptHash,
    promptKind,
    modelId,
    repeats,
  });

  let costUsd = 0;
  let runTokens = emptyTokens();
  const repeatScores: number[] = [];
  const scoresByTask = new Map<string, number[]>();
  const tokensByTask = new Map<string, TokenUsage>();
  const lastByTask = new Map<string, RunResult["perTask"][number]>();
  let stop: "cancelled" | "budget_stop" | null = null;
  // Record the grade.js that will run (pinned harness for imports) so
  // Comparison can fail closed if legs used different graders.
  let gradeHash: string | undefined;
  try {
    gradeHash = resolveTrustedScriptsDir(skill.root).gradeHash;
  } catch {
    gradeHash = undefined;
  }
  const capture: RunCapture = {
    githubUrl: skill.manifest.githubUrl,
    commit: skill.manifest.commit,
    license: skill.manifest.license,
    dependencies: skill.manifest.dependencies,
    skillVersion: skill.version,
    role,
    promptHash,
    promptPreview,
    promptKind,
    env: {
      modelDryRun: config.modelDryRun,
      modelOfficial: config.modelOfficial,
      temperature: config.temperature,
      topP: config.topP,
      seed: config.seed,
      maxOutputTokens: config.maxOutputTokens,
      costCapUsd: config.costCapUsd,
      costHardStop: config.costHardStop,
      fakeProduce: process.env.FAKE_PRODUCE === "known-good",
      allowHostGrade: config.allowHostGrade,
      grade: hostGrade ? "host_script" : "docker_script",
      ...(gradeHash ? { gradeHash } : {}),
    },
    capturedAt: startedAt,
  };
  writeJsonFile(path.join(resultDir, "capture.json"), capture);

  const statusPath = path.join(resultDir, "status.json");
  const cancelPath = path.join(config.jobsDir, `${runId}.cancel`);
  const writeStatus = (fields: {
    status: string;
    repeat?: number;
    repeats?: number;
    costUsd?: number;
  }) => {
    writeJsonFile(statusPath, {
      runId,
      status: fields.status,
      role,
      ...(job.evaluationId ? { evaluationId: job.evaluationId } : {}),
      ...(fields.repeat !== undefined ? { repeat: fields.repeat } : {}),
      ...(fields.repeats !== undefined ? { repeats: fields.repeats } : {}),
      ...(fields.costUsd !== undefined ? { costUsd: fields.costUsd } : {}),
    });
  };

  const heartbeatTimer = setInterval(() => {
    touchHeartbeat({ busy: true, runId });
  }, 5_000);
  touchHeartbeat({ busy: true, runId });

  try {
    if (fs.existsSync(cancelPath)) {
      stop = "cancelled";
      findings.push("cancelled");
    }

    writeStatus({
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
        writeStatus({
          status: liveRunStatusForProgress({
            stop,
            cancelFilePresent: fs.existsSync(cancelPath),
          }),
          repeat: r,
          repeats,
          costUsd,
        });
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
          writeStatus({
            status: liveRunStatusForProgress({
              stop,
              cancelFilePresent: fs.existsSync(cancelPath),
            }),
            repeat: r,
            repeats,
            costUsd,
          });
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
        let callPromptTokens = 0;
        let callCompletionTokens = 0;
        const fakeProduce = process.env.FAKE_PRODUCE === "known-good";
        if (fakeProduce) {
          content = readRegularFileUtf8(tp.knownGoodPath, "known-good");
        } else {
          const remainingUsd = config.costCapUsd - costUsd;
          const clampedMaxTokens = config.costHardStop
            ? maxOutputTokensForRemainingBudget({
                modelId,
                remainingUsd,
                maxOutputTokens: config.maxOutputTokens,
              })
            : config.maxOutputTokens;
          const nextCallUsd = estimateCallCostUsdForCap(
            modelId,
            clampedMaxTokens,
          );
          if (
            config.costHardStop &&
            (clampedMaxTokens < 1 ||
              wouldExceedCostCap({
                spentUsd: costUsd,
                nextCallUsd,
                capUsd: config.costCapUsd,
              }))
          ) {
            stop = "budget_stop";
            if (!findings.includes("cost hard stop")) {
              findings.push("cost hard stop");
            }
            if (!findings.includes("cost pre-check blocked produce")) {
              findings.push("cost pre-check blocked produce");
            }
            writeStatus({
              status: liveRunStatusForProgress({
                stop,
                cancelFilePresent: fs.existsSync(cancelPath),
              }),
              repeat: r,
              repeats,
              costUsd,
            });
            break outer;
          }
          try {
            const produced = await produceArtifact({
              modelId,
              skillMd: skill.skillMd,
              role,
              inputPath: tp.inputPath,
              targetFile: tp.targetFile,
              subjectDir: tp.subjectDir,
              seed: config.seed + r,
              cancelPath,
              maxOutputTokens: clampedMaxTokens,
              remainingUsd: config.costHardStop ? remainingUsd : undefined,
            });
            content = produced.content;
            produceCost = produced.costUsd;
            callPromptTokens = produced.promptTokens;
            callCompletionTokens = produced.completionTokens;
          } catch (e) {
            if (
              e instanceof ProduceCancelledError ||
              fs.existsSync(cancelPath)
            ) {
              stop = "cancelled";
              if (!findings.includes("cancelled")) findings.push("cancelled");
              break outer;
            }
            if (
              config.costHardStop &&
              e instanceof Error &&
              e.message.includes("cost budget exhausted")
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
            throw e;
          }
        }
        fs.writeFileSync(artifactPath, content, "utf8");
        costUsd += produceCost;
        runTokens = addTokens(runTokens, callPromptTokens, callCompletionTokens);
        tokensByTask.set(
          taskId,
          addTokens(
            tokensByTask.get(taskId) ?? emptyTokens(),
            callPromptTokens,
            callCompletionTokens,
          ),
        );

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
          const overshootUsd = costUsd - config.costCapUsd;
          if (overshootUsd > 0) {
            const overshootFinding = `cost overshootUsd=${overshootUsd.toFixed(6)} after produce`;
            if (!findings.some((f) => f.startsWith("cost overshootUsd="))) {
              findings.push(overshootFinding);
            }
          }
          writeStatus({
            status: liveRunStatusForProgress({
              stop,
              cancelFilePresent: fs.existsSync(cancelPath),
            }),
            repeat: r,
            repeats,
            costUsd,
          });
          // Skip Docker/host grade — cap already hit after produce.
          break outer;
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
            const expected = readRegularFileUtf8(tp.expectedPath, "expected");
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

      writeStatus({
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
      const completed = last !== undefined;
      let taskStatus: RunResult["perTask"][number]["status"];
      if (!completed && stop === "cancelled") taskStatus = "cancelled";
      else if (!completed && stop === "budget_stop") taskStatus = "budget_stop";
      else if (mean !== null && mean >= PASS_SCORE_FLOOR) taskStatus = "ok";
      else taskStatus = "failed";
      const taskTokens = tokensByTask.get(taskId);
      return {
        taskId,
        artifactRef: last?.artifactRef,
        expectedRef: last?.expectedRef,
        scriptResults: last?.scriptResults ?? [],
        // Keep measured per-task scores on budget_stop/cancel; only incomplete
        // tasks stay null. Aggregate run score is still null when stopped.
        score: completed ? mean : null,
        status: taskStatus,
        ...(last?.diffRatio !== undefined
          ? { diffRatio: last.diffRatio }
          : {}),
        ...(taskTokens && taskTokens.totalTokens > 0
          ? { tokens: taskTokens }
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

    const result = RunResultSchema.parse({
      runId,
      evalSkillId: skill.id,
      evalSkillVersion: skill.version,
      evalSkillGithubUrl: skill.manifest.githubUrl,
      capture,
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
      tokens: runTokens,
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
    writeStatus({
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
