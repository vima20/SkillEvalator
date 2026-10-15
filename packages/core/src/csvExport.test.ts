import { describe, expect, it } from "vitest";
import { buildBenefitReport } from "./benefitReport.js";
import { compareBaselineCandidate } from "./comparison.js";
import {
  benefitReportToCsv,
  comparisonToCsv,
  runResultToCsv,
} from "./csvExport.js";
import type { RunResult } from "./schema.js";

function sample(over: Partial<RunResult> & Pick<RunResult, "runId" | "role">): RunResult {
  const { runId, role, ...rest } = over;
  return {
    evalSkillId: "code-debugging-eval",
    evalSkillVersion: "abc",
    evaluationId: "eval_csv_1",
    taskSetId: "cde-v1",
    taskIds: ["bug-01"],
    pipeline: { produce: "model", grade: "docker_script" },
    modelId: "gpt-4o-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: 1,
    aggregate: "mean",
    perTask: [
      {
        taskId: "bug-01",
        score: 0.9,
        status: "ok",
        scriptResults: [],
        tokens: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ],
    score: 0.9,
    subscores: {},
    rationale: "",
    findings: [],
    costUsd: 0.01,
    latencyMs: 1000,
    tokens: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    status: "ok",
    startedAt: "2026-10-12T00:00:00.000Z",
    mode: "dry-run",
    ...rest,
    runId,
    role: role ?? "candidate",
  };
}

describe("runResultToCsv", () => {
  it("includes token columns", () => {
    const csv = runResultToCsv(sample({ runId: "r1", role: "candidate" }));
    expect(csv).toContain("promptTokens");
    expect(csv).toContain("r1");
    expect(csv).toContain("bug-01");
    expect(csv.split("\n").length).toBeGreaterThan(1);
  });
});

const TRUSTED_GRADE_HASH =
  "gradehash0000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function officialCapture(role: "baseline" | "candidate") {
  return {
    githubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    commit: "deadbeef",
    license: "MIT",
    dependencies: [] as string[],
    skillVersion: "abc",
    role,
    promptHash: role === "baseline" ? "baselinehash0001" : "candidatehash0002",
    promptKind:
      role === "baseline"
        ? ("baseline_neutral" as const)
        : ("skill_md" as const),
    env: {
      gradeHash: TRUSTED_GRADE_HASH,
      fakeProduce: false,
      produceAttested: true,
      costCapUsd: 5,
      costHardStop: true,
      allowHostGrade: false,
      temperature: 0,
      topP: 1,
      seed: 42,
      maxOutputTokens: 1024,
      modelDryRun: "gpt-4o-mini",
      modelOfficial: "gpt-4.1-mini",
      grade: "docker_script" as const,
    },
  };
}

describe("comparisonToCsv", () => {
  it("exports task deltas and skill attribution", () => {
    const cmp = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        capture: officialCapture("baseline"),
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        capture: officialCapture("candidate"),
      }),
      { expectedGradeHash: TRUSTED_GRADE_HASH },
    );
    expect(cmp.verdict).toBe("PASS");
    const csv = comparisonToCsv(cmp);
    expect(csv).toContain("delta");
    expect(csv).toContain("bug-01");
    expect(csv).toContain("PASS");
    expect(csv).toContain("evalSkillId");
    expect(csv).toContain("code-debugging-eval");
    expect(csv).toContain("gpt-4.1-mini");
    expect(csv).toContain("official");
    expect(csv).toContain("cde-v1");
    expect(csv).toContain("parityIssues");
  });

  it("exports candidate Capture commit and license", () => {
    const cmp = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.7 }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.9,
        capture: {
          githubUrl: "https://github.com/acme/skills",
          commit: "abcdef1234567890",
          license: "MIT",
          dependencies: [],
          skillVersion: "abc",
          role: "candidate",
          promptHash: "ph",
          promptPreview: "preview",
          promptKind: "skill_md",
          env: {
            modelDryRun: "gpt-4o-mini",
            modelOfficial: "gpt-4.1-mini",
            temperature: 0,
            topP: 1,
            seed: 1,
            maxOutputTokens: 1024,
            costCapUsd: 5,
            costHardStop: true,
            fakeProduce: false,
            allowHostGrade: false,
            grade: "docker_script",
          },
          capturedAt: "2026-10-12T00:00:00.000Z",
        },
      }),
    );
    const csv = comparisonToCsv(cmp);
    const header = csv.split("\n")[0]!;
    expect(header).toContain("commit");
    expect(header).toContain("license");
    expect(csv).toContain("abcdef1234567890");
    expect(csv).toContain("MIT");
  });

  it("leaves commit/license empty when Capture is missing", () => {
    const cmp = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.7 }),
      sample({ runId: "c", role: "candidate", score: 0.9 }),
    );
    const csv = comparisonToCsv(cmp);
    const dataLine = csv.trim().split("\n")[1]!;
    expect(dataLine.endsWith(",")).toBe(true);
  });

  it("exports parityIssues when INCONCLUSIVE", () => {
    const cmp = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5 }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        modelId: "gpt-4.1-mini",
      }),
    );
    const csv = comparisonToCsv(cmp);
    expect(csv).toContain("INCONCLUSIVE");
    expect(csv).toContain("modelId mismatch");
  });
});

describe("benefitReportToCsv", () => {
  it("exports recommendation and tasks", () => {
    const report = buildBenefitReport(
      sample({ runId: "r1", role: "candidate", score: 1 }),
    );
    const csv = benefitReportToCsv(report, {
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      comparisonLift: 0.1,
    });
    expect(csv).toContain("recommendation");
    expect(csv).toContain("comparisonVerdict");
    expect(csv).toContain("PASS");
    expect(csv).toContain("r1");
    expect(csv).toContain("bug-01");
  });
});
