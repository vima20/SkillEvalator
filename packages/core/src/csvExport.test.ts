import { describe, expect, it } from "vitest";
import { buildBenefitReport } from "./benefitReport.js";
import { compareBaselineCandidate } from "./comparison.js";
import {
  benefitReportToCsv,
  comparisonToCsv,
  runResultToCsv,
} from "./csvExport.js";
import { jobAttestationFromRunResult } from "./jobSnapshot.js";
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

  it("includes fakeProduce and produceAttested columns", () => {
    const csv = runResultToCsv(
      sample({
        runId: "r1",
        role: "candidate",
        capture: officialCapture("candidate"),
      }),
    );
    expect(csv).toContain("fakeProduce");
    expect(csv).toContain("produceAttested");
    expect(csv).toMatch(/false/);
    expect(csv).toMatch(/true/);
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
    const baseline = sample({
      runId: "b",
      role: "baseline",
      score: 0.9,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      scoreSpread: 0,
      capture: officialCapture("baseline"),
    });
    const candidate = sample({
      runId: "c",
      role: "candidate",
      score: 1,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      scoreSpread: 0,
      perTask: [
        {
          taskId: "bug-01",
          score: 1,
          status: "ok",
          scriptResults: [],
          tokens: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
      ],
      capture: officialCapture("candidate"),
    });
    const cmp = compareBaselineCandidate(baseline, candidate, {
      expectedGradeHash: TRUSTED_GRADE_HASH,
      expectedBaselinePromptHash: "baselinehash0001",
      expectedCandidatePromptHash: "candidatehash0002",
      expectedBaselineEvalSkillVersion: "abc",
      expectedCandidateEvalSkillVersion: "abc",
      expectedBaselinePromptKind: "baseline_neutral" as const,
      expectedCandidatePromptKind: "skill_md" as const,
      expectedTaskSetId: "cde-v1",
      expectedTaskIds: ["bug-01"],
      expectedBaselineJob: jobAttestationFromRunResult(baseline)!,
      expectedCandidateJob: jobAttestationFromRunResult(candidate)!,
    });
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
    expect(csv).toContain("baselineFakeProduce");
    expect(csv).toContain("baselineProduceAttested");
    expect(csv).toContain("candidateFakeProduce");
    expect(csv).toContain("candidateProduceAttested");
    const withTips = comparisonToCsv(cmp, {
      baselineFakeProduce: false,
      baselineProduceAttested: true,
      candidateFakeProduce: false,
      candidateProduceAttested: true,
    });
    expect(withTips).toContain("baselineProduceAttested");
    const goldenCsv = comparisonToCsv(cmp, {
      candidatePerTask: [{ taskId: "bug-01", diffRatio: 0 }],
    });
    expect(goldenCsv).toContain("candidateTasksGoldenPassed");
    expect(goldenCsv).toContain("candidateGoldenQuality");
    expect(goldenCsv).toContain("golden");
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
    const header = csv.split("\n")[0]!;
    const dataLine = csv.trim().split("\n")[1]!;
    expect(header).toContain("commit");
    expect(dataLine.split(",").length).toBe(header.split(",").length);
    const commitIdx = header.split(",").indexOf("commit");
    expect(dataLine.split(",")[commitIdx]).toBe("");
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

  it("uses adoptionMode for mode column when tip legs differ from comparison.json", () => {
    const cmp = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.9, mode: "dry-run" }),
      sample({ runId: "c", role: "candidate", score: 1, mode: "dry-run" }),
    );
    const csv = comparisonToCsv(cmp, { adoptionMode: "official" });
    const dataLine = csv.trim().split("\n")[1]!;
    expect(dataLine).toContain("official");
    expect(dataLine).not.toMatch(/,dry-run,/);
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
    expect(csv).toContain("tasksGoldenPassed");
    expect(csv).toContain("taskDiffRatio");
    expect(csv).toContain("taskGoldenQuality");
  });
});
