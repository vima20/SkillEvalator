import { describe, expect, it } from "vitest";
import {
  compareSkillVersionRuns,
  compatibleNewVersionRuns,
  defaultSkillVersionPair,
  oldVersionRunOptions,
  skillVersionRunsAreCompatible,
  toSkillVersionRun,
  type SkillVersionRun,
  type SkillVersionRunSource,
} from "./skillVersionComparison";

function source(overrides: {
  runId?: string;
  role?: "baseline" | "candidate";
  result?: Partial<NonNullable<SkillVersionRunSource["result"]>>;
} = {}): SkillVersionRunSource {
  const result: NonNullable<SkillVersionRunSource["result"]> = {
    status: "ok",
    role: "candidate",
    evalSkillId: "debug-skill",
    evalSkillVersion: "version-a",
    taskSetId: "debug-v1",
    taskIds: ["bug-1", "bug-2"],
    modelId: "model-a",
    mode: "dry-run",
    pipeline: { grade: "docker_script" },
    capture: { env: { fakeProduce: false, produceAttested: true, gradeHash: "grader-a" } },
    repeats: 1,
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    score: 0.5,
    startedAt: "2026-10-26T10:00:00.000Z",
    perTask: [
      { taskId: "bug-1", score: 0.5, status: "ok" },
      { taskId: "bug-2", score: 0.5, status: "ok" },
    ],
    ...overrides.result,
  };
  return {
    runId: overrides.runId ?? "run-a",
    role: overrides.role ?? "candidate",
    result,
  };
}

function run(overrides: Partial<SkillVersionRun> = {}): SkillVersionRun {
  return {
    runId: "run-a",
    skillId: "debug-skill",
    skillVersion: "version-a",
    taskSetId: "debug-v1",
    taskIds: ["bug-1", "bug-2"],
    modelId: "model-a",
    mode: "dry-run",
    grade: "docker_script",
    gradeHash: "grader-a",
    fakeProduce: false,
    repeats: 1,
    temperature: 0,
    topP: 1,
    seed: 42,
    maxOutputTokens: null,
    score: 0.5,
    startedAt: "2026-10-26T10:00:00.000Z",
    perTask: [
      { taskId: "bug-1", score: 0.5, status: "ok" },
      { taskId: "bug-2", score: 0.5, status: "ok" },
    ],
    ...overrides,
  };
}

describe("toSkillVersionRun", () => {
  it("keeps only successful, live, attested candidate runs", () => {
    expect(toSkillVersionRun(source())).toMatchObject({
      runId: "run-a",
      skillId: "debug-skill",
      skillVersion: "version-a",
      fakeProduce: false,
    });
    expect(toSkillVersionRun(source({ result: { status: "failed" } }))).toBeNull();
    expect(
      toSkillVersionRun(source({ result: { role: "baseline" } })),
    ).toBeNull();
    expect(
      toSkillVersionRun(source({ role: "baseline", result: { role: undefined } })),
    ).toBeNull();
    expect(
      toSkillVersionRun(source({ result: { capture: { env: { fakeProduce: true } } } })),
    ).toBeNull();
    expect(
      toSkillVersionRun(source({ result: { capture: { env: { produceAttested: false } } } })),
    ).toBeNull();
    expect(
      toSkillVersionRun(source({ result: { capture: { env: { produceAttested: undefined } } } })),
    ).toBeNull();
  });
});

describe("skill version run compatibility", () => {
  it("allows task IDs in a different order", () => {
    expect(
      skillVersionRunsAreCompatible(
        run(),
        run({ runId: "run-b", taskIds: ["bug-2", "bug-1"] }),
      ),
    ).toBe(true);
  });

  it.each([
    ["skillId", { skillId: "another-skill" }],
    ["taskSetId", { taskSetId: "another-set" }],
    ["taskIds", { taskIds: ["bug-1"] }],
    ["modelId", { modelId: "another-model" }],
    ["mode", { mode: "official" as const }],
    ["grader", { grade: "host_script" as const }],
    ["grader hash", { gradeHash: "grader-b" }],
    ["repeats", { repeats: 2 }],
    ["temperature", { temperature: 0.2 }],
    ["top P", { topP: 0.9 }],
    ["seed", { seed: 7 }],
    ["max output tokens", { maxOutputTokens: 2048 }],
  ])("rejects a mismatch in %s", (_field, patch) => {
    expect(skillVersionRunsAreCompatible(run(), run({ runId: "run-b", ...patch }))).toBe(false);
  });

  it("does not pair a run with itself", () => {
    expect(skillVersionRunsAreCompatible(run(), run())).toBe(false);
  });
});

describe("skill version pair selection", () => {
  it("chooses the latest compatible old→new pair and skips unrelated newer runs", () => {
    const older = run({ runId: "old", startedAt: "2026-10-20T10:00:00.000Z" });
    const newer = run({
      runId: "new",
      skillVersion: "version-b",
      startedAt: "2026-10-25T10:00:00.000Z",
    });
    const latestButIncompatible = run({
      runId: "new-model",
      skillVersion: "version-c",
      modelId: "model-b",
      startedAt: "2026-10-26T10:00:00.000Z",
    });

    expect(defaultSkillVersionPair([older, latestButIncompatible, newer])).toEqual({
      oldId: "old",
      newId: "new",
    });
    expect(compatibleNewVersionRuns(older, [older, newer, latestButIncompatible])).toEqual([
      newer,
    ]);
    expect(oldVersionRunOptions([older, newer, latestButIncompatible])).toEqual([older]);
  });

  it("does not create a version pair for the same hash or for a newer old leg", () => {
    const old = run({ runId: "old", startedAt: "2026-10-20T10:00:00.000Z" });
    const sameVersion = run({ runId: "rerun", startedAt: "2026-10-21T10:00:00.000Z" });
    const earlier = run({
      runId: "earlier",
      skillVersion: "version-b",
      startedAt: "2026-10-19T10:00:00.000Z",
    });

    expect(defaultSkillVersionPair([sameVersion, old])).toEqual({
      oldId: "rerun",
      newId: "",
    });
    expect(compareSkillVersionRuns(old, earlier)).toBeNull();
  });
});

describe("compareSkillVersionRuns", () => {
  it("returns aggregate and per-task score changes", () => {
    const old = run();
    const newer = run({
      runId: "run-b",
      skillVersion: "version-b",
      startedAt: "2026-10-27T10:00:00.000Z",
      score: 0.75,
      perTask: [
        { taskId: "bug-1", score: 1, status: "ok" },
        { taskId: "bug-2", score: 0.5, status: "ok" },
      ],
    });

    expect(compareSkillVersionRuns(old, newer)).toEqual({
      scoreDelta: 0.25,
      tasks: [
        { taskId: "bug-1", oldScore: 0.5, newScore: 1, scoreDelta: 0.5 },
        { taskId: "bug-2", oldScore: 0.5, newScore: 0.5, scoreDelta: 0 },
      ],
    });
  });

  it("uses null when an aggregate or task score is unavailable", () => {
    const old = run({ score: null });
    const newer = run({
      runId: "run-b",
      skillVersion: "version-b",
      startedAt: "2026-10-27T10:00:00.000Z",
      score: 0.75,
      perTask: [
        { taskId: "bug-1", score: null, status: "failed" },
        { taskId: "bug-2", score: 0.5, status: "ok" },
      ],
    });

    expect(compareSkillVersionRuns(old, newer)).toEqual({
      scoreDelta: null,
      tasks: [
        { taskId: "bug-1", oldScore: 0.5, newScore: null, scoreDelta: null },
        { taskId: "bug-2", oldScore: 0.5, newScore: 0.5, scoreDelta: 0 },
      ],
    });
  });
});
