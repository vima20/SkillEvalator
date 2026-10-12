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

describe("comparisonToCsv", () => {
  it("exports task deltas", () => {
    const cmp = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.7 }),
      sample({ runId: "c", role: "candidate", score: 0.9 }),
    );
    const csv = comparisonToCsv(cmp);
    expect(csv).toContain("delta");
    expect(csv).toContain("bug-01");
    expect(csv).toContain("PASS");
  });
});

describe("benefitReportToCsv", () => {
  it("exports recommendation and tasks", () => {
    const report = buildBenefitReport(
      sample({ runId: "r1", role: "candidate", score: 1 }),
    );
    const csv = benefitReportToCsv(report);
    expect(csv).toContain("recommendation");
    expect(csv).toContain("r1");
    expect(csv).toContain("bug-01");
  });
});
