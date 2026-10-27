export type SkillVersionRun = {
  runId: string;
  skillId: string;
  skillVersion: string;
  taskSetId: string;
  taskIds: string[];
  modelId: string;
  mode: "dry-run" | "official";
  grade: "docker_script" | "host_script";
  gradeHash: string;
  fakeProduce: boolean;
  repeats: number;
  temperature: number;
  topP: number;
  seed: number | null;
  maxOutputTokens: number | null;
  score: number | null;
  scoreSpread?: number | null;
  sourceUrl?: string | null;
  sourceCommit?: string | null;
  startedAt: string;
  perTask: Array<{ taskId: string; score: number | null; status: string }>;
};

export type SkillVersionRunSource = {
  runId: string;
  role?: "baseline" | "candidate";
  result: {
    status: string;
    role?: "baseline" | "candidate";
    evalSkillId: string;
    evalSkillVersion: string;
    evalSkillGithubUrl?: string;
    taskSetId: string;
    taskIds: string[];
    modelId: string;
    mode: "dry-run" | "official";
    pipeline: { grade: "docker_script" | "host_script" };
    capture?: {
      commit?: string;
      env?: {
        fakeProduce?: boolean;
        produceAttested?: boolean;
        gradeHash?: string;
        maxOutputTokens?: number;
      };
    };
    repeats: number;
    decoding: { temperature: number; top_p: number; seed?: number };
    score: number | null;
    scoreSpread?: number;
    startedAt: string;
    perTask: Array<{ taskId: string; score: number | null; status: string }>;
  } | null;
};

export function toSkillVersionRun(
  source: SkillVersionRunSource,
): SkillVersionRun | null {
  const result = source.result;
  if (
    !result ||
    result.status !== "ok" ||
    (result.role ?? source.role) !== "candidate" ||
    result.capture?.env?.fakeProduce === true ||
    result.capture?.env?.produceAttested !== true
  ) {
    return null;
  }

  return {
    runId: source.runId,
    skillId: result.evalSkillId,
    skillVersion: result.evalSkillVersion,
    taskSetId: result.taskSetId,
    taskIds: result.taskIds,
    modelId: result.modelId,
    mode: result.mode,
    grade: result.pipeline.grade,
    gradeHash: result.capture?.env?.gradeHash ?? "",
    fakeProduce: false,
    repeats: result.repeats,
    temperature: result.decoding.temperature,
    topP: result.decoding.top_p,
    seed: result.decoding.seed ?? null,
    maxOutputTokens: result.capture?.env?.maxOutputTokens ?? null,
    score: result.score,
    scoreSpread: result.scoreSpread ?? null,
    sourceUrl: result.evalSkillGithubUrl ?? null,
    sourceCommit: result.capture?.commit ?? null,
    startedAt: result.startedAt,
    perTask: result.perTask.map(({ taskId, score, status }) => ({
      taskId,
      score,
      status,
    })),
  };
}

function sameTaskIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
}

export function skillVersionRunsAreCompatible(
  a: SkillVersionRun,
  b: SkillVersionRun,
) {
  return (
    a.runId !== b.runId &&
    a.skillId === b.skillId &&
    a.taskSetId === b.taskSetId &&
    a.modelId === b.modelId &&
    a.mode === b.mode &&
    a.grade === b.grade &&
    a.gradeHash === b.gradeHash &&
    a.fakeProduce === b.fakeProduce &&
    a.repeats === b.repeats &&
    a.temperature === b.temperature &&
    a.topP === b.topP &&
    a.seed === b.seed &&
    a.maxOutputTokens === b.maxOutputTokens &&
    sameTaskIds(a.taskIds, b.taskIds)
  );
}

function isLaterRun(oldRun: SkillVersionRun, newRun: SkillVersionRun) {
  return Date.parse(newRun.startedAt) > Date.parse(oldRun.startedAt);
}

export function defaultSkillVersionPair(runs: SkillVersionRun[]) {
  const newestFirst = [...runs].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
  for (let newerIndex = 0; newerIndex < newestFirst.length; newerIndex += 1) {
    const newer = newestFirst[newerIndex]!;
    for (
      let olderIndex = newerIndex + 1;
      olderIndex < newestFirst.length;
      olderIndex += 1
    ) {
      const older = newestFirst[olderIndex]!;
      if (
        older.skillVersion !== newer.skillVersion &&
        skillVersionRunsAreCompatible(older, newer) &&
        isLaterRun(older, newer)
      ) {
        return { oldId: older.runId, newId: newer.runId };
      }
    }
  }
  return { oldId: newestFirst[0]?.runId ?? "", newId: "" };
}

export function compatibleNewVersionRuns(
  oldRun: SkillVersionRun,
  runs: SkillVersionRun[],
) {
  return runs.filter(
    (run) =>
      run.skillVersion !== oldRun.skillVersion &&
      skillVersionRunsAreCompatible(oldRun, run) &&
      isLaterRun(oldRun, run),
  );
}

export function oldVersionRunOptions(runs: SkillVersionRun[]) {
  return runs.filter((run) => compatibleNewVersionRuns(run, runs).length > 0);
}

/** Summarize why the available runs cannot form an older→newer version pair. */
export function skillVersionRunComparisonBlockers(runs: SkillVersionRun[]) {
  const reasons = new Set<string>();
  let hasDifferentVersions = false;
  let hasChronologicalPair = false;

  for (let firstIndex = 0; firstIndex < runs.length; firstIndex += 1) {
    const first = runs[firstIndex]!;
    for (let secondIndex = firstIndex + 1; secondIndex < runs.length; secondIndex += 1) {
      const second = runs[secondIndex]!;
      if (first.skillVersion === second.skillVersion) continue;
      hasDifferentVersions = true;

      const firstTime = Date.parse(first.startedAt);
      const secondTime = Date.parse(second.startedAt);
      const chronological =
        Number.isFinite(firstTime) &&
        Number.isFinite(secondTime) &&
        firstTime !== secondTime;
      if (chronological) hasChronologicalPair = true;

      if (first.taskSetId !== second.taskSetId) reasons.add("Different task sets");
      if (!sameTaskIds(first.taskIds, second.taskIds)) reasons.add("Different task IDs");
      if (first.modelId !== second.modelId) reasons.add("Different models");
      if (first.grade !== second.grade || first.gradeHash !== second.gradeHash) {
        reasons.add("Different graders or grader versions");
      }
      if (first.mode !== second.mode) reasons.add("Different run modes");
      if (
        first.repeats !== second.repeats ||
        first.temperature !== second.temperature ||
        first.topP !== second.topP ||
        first.seed !== second.seed ||
        first.maxOutputTokens !== second.maxOutputTokens ||
        first.fakeProduce !== second.fakeProduce
      ) {
        reasons.add("Different run settings (repeats or decoding)");
      }
    }
  }

  if (!hasDifferentVersions) return [];
  if (!hasChronologicalPair) reasons.add("The newer version must have a later run timestamp");
  return [...reasons];
}

export function compareSkillVersionRuns(
  oldRun: SkillVersionRun,
  newRun: SkillVersionRun,
) {
  if (
    oldRun.skillVersion === newRun.skillVersion ||
    !skillVersionRunsAreCompatible(oldRun, newRun) ||
    !isLaterRun(oldRun, newRun)
  ) {
    return null;
  }

  const oldTasks = new Map(oldRun.perTask.map((task) => [task.taskId, task]));
  return {
    scoreDelta:
      oldRun.score !== null && newRun.score !== null
        ? newRun.score - oldRun.score
        : null,
    tasks: newRun.perTask.map((task) => {
      const oldScore = oldTasks.get(task.taskId)?.score ?? null;
      return {
        taskId: task.taskId,
        oldScore,
        newScore: task.score,
        scoreDelta:
          oldScore !== null && task.score !== null
            ? task.score - oldScore
            : null,
      };
    }),
  };
}
