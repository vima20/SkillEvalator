import { describe, expect, it } from "vitest";
import type { RunComparison } from "./comparison.js";
import {
  applyPairedComparisonGate,
  buildBenefitReport,
  benefitReportToMarkdown,
  decideSkillUse,
  rateSkill,
} from "./benefitReport.js";
import type { RunResult } from "./schema.js";

function comparisonStub(
  verdict: RunComparison["verdict"],
  lift = 0.1,
): RunComparison {
  return {
    evaluationId: "eval_test",
    baselineRunId: "b1",
    candidateRunId: "c1",
    evalSkillId: "code-debugging-eval",
    taskSetId: "cde-v1",
    mode: "official",
    modelId: "gpt-4.1-mini",
    baselineScore: 0.9,
    candidateScore: 0.9 + lift,
    lift,
    costUsd: 0.02,
    latencyMs: 2000,
    verdict,
    rationale: `stub ${verdict}`,
    baselineStatus: "ok",
    candidateStatus: "ok",
    capture: undefined,
    parity: { ok: verdict !== "INCONCLUSIVE", issues: [] },
    perTask: [],
    regressions: 0,
    improvements: 0,
  };
}

function sample(overrides: Partial<RunResult> = {}): RunResult {
  return {
    runId: "run_test",
    evalSkillId: "code-debugging-eval",
    evalSkillVersion: "abc123",
    evalSkillGithubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    taskSetId: "cde-v1",
    taskIds: ["bug-01"],
    pipeline: { produce: "model", grade: "docker_script" },
    modelId: "gpt-4o-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: 1,
    aggregate: "mean",
    scoreSpread: 0,
    perTask: [
      {
        taskId: "bug-01",
        scriptResults: [{ name: "grade", exitCode: 0, summary: "ok" }],
        score: 1,
        status: "ok",
      },
    ],
    score: 1,
    subscores: {},
    rationale: "",
    findings: [],
    costUsd: 0.01,
    latencyMs: 1200,
    status: "ok",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:02.000Z",
    mode: "dry-run",
    ...overrides,
    role: overrides.role ?? "candidate",
  };
}

describe("decideSkillUse", () => {
  it("inconclusive on passing dry-run", () => {
    const v = decideSkillUse(sample({ mode: "dry-run", score: 1 }));
    expect(v.recommendation).toBe("inconclusive");
    expect(v.headline).toMatch(/official/i);
  });

  it("do not use on failing dry-run", () => {
    const v = decideSkillUse(sample({ mode: "dry-run", score: 0 }));
    expect(v.recommendation).toBe("do_not_use");
  });

  it("use on passing official", () => {
    const v = decideSkillUse(
      sample({ mode: "official", score: 1, modelId: "gpt-4.1-mini", repeats: 3 }),
    );
    expect(v.recommendation).toBe("use");
    expect(v.headline).toMatch(/USE/);
  });

  it("inconclusive when role is missing (do not invent candidate)", () => {
    const base = sample({
      mode: "official",
      score: 1,
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const { role: _drop, ...rest } = base;
    const v = decideSkillUse(rest as RunResult);
    expect(v.recommendation).toBe("inconclusive");
    expect(v.headline).toMatch(/missing.*role/i);
  });

  it("inconclusive on official pass when fakeProduce smoke", () => {
    const v = decideSkillUse(
      sample({
        mode: "official",
        score: 1,
        modelId: "gpt-4.1-mini",
        repeats: 3,
        capture: {
          role: "candidate",
          skillVersion: "abc123",
          dependencies: [],
          env: { fakeProduce: true },
        },
      }),
    );
    expect(v.recommendation).toBe("inconclusive");
    expect(v.headline).toMatch(/smoke|FAKE_PRODUCE/i);
  });

  it("use on official near-perfect (≥0.99)", () => {
    const v = decideSkillUse(
      sample({
        mode: "official",
        score: 0.995,
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
    );
    expect(v.recommendation).toBe("use");
  });

  it("do not use on failing official", () => {
    const v = decideSkillUse(sample({ mode: "official", score: 0.5, repeats: 3 }));
    expect(v.recommendation).toBe("do_not_use");
  });
});

describe("benefitReport", () => {
  it("includes verdict, stars and written review", () => {
    const report = buildBenefitReport(sample());
    expect(report.verdict.recommendation).toBe("inconclusive");
    expect(report.rating.stars).toBe(4);
    expect(report.rating.grade).toBe("Good");
    expect(report.rating.starsDisplay).toBe("★★★★☆");
    expect(report.rating.reviewSections.map((s) => s.heading)).toEqual(
      expect.arrayContaining(["Result", "What this shows", "Recommendation", "Limitation"]),
    );
    expect(report.rating.review).not.toMatch(/^Written review:/);
    const md = benefitReportToMarkdown(report);
    expect(md).toContain("## Verdict");
    expect(md).toContain("## Rating");
    expect(md).toContain("## Written review");
    expect(md).toContain("### Recommendation");
    expect(md).toContain("INCONCLUSIVE");
    expect(md).toMatch(/not proof of Cursor\/KH/i);
  });

  it("gives 5 stars only on official pass with Comparison PASS", () => {
    const report = buildBenefitReport(
      sample({
        mode: "official",
        score: 1,
        modelId: "gpt-4.1-mini",
        repeats: 3,
        evaluationId: "eval_test",
      }),
      { comparison: comparisonStub("PASS") },
    );
    expect(report.rating.stars).toBe(5);
    expect(report.rating.grade).toBe("Excellent");
    expect(report.verdict.recommendation).toBe("use");
  });

  it("baseline official score never earns 5★ or adopt prose", () => {
    const report = buildBenefitReport(
      sample({
        role: "baseline",
        mode: "official",
        score: 1,
        modelId: "gpt-4.1-mini",
        repeats: 3,
        evaluationId: "eval_test",
      }),
      { comparison: comparisonStub("PASS") },
    );
    expect(report.verdict.recommendation).toBe("inconclusive");
    expect(report.rating.stars).toBeLessThanOrEqual(3);
    expect(report.rating.summary).toMatch(/baseline/i);
    expect(report.rating.grade).not.toBe("Excellent");
    expect(report.rating.review).not.toMatch(/fit for use/i);
    expect(report.rating.review).toMatch(/Comparison/i);
  });

  it("locks USE / 5★ when Comparison is FAIL or missing", () => {
    const official = sample({
      mode: "official",
      score: 1,
      modelId: "gpt-4.1-mini",
      repeats: 3,
      evaluationId: "eval_test",
    });
    const fail = buildBenefitReport(official, {
      comparison: comparisonStub("FAIL", 0.02),
    });
    expect(fail.verdict.recommendation).toBe("do_not_use");
    expect(fail.rating.stars).toBeLessThan(5);
    expect(fail.verdict.headline).toMatch(/Comparison FAIL/i);

    const waiting = buildBenefitReport(official, { comparison: null });
    expect(waiting.verdict.recommendation).toBe("inconclusive");
    expect(waiting.rating.stars).toBe(4);
    expect(waiting.rating.review).not.toMatch(/fit for use/i);
    expect(waiting.rating.review).not.toMatch(/\(5\/5\)/);
    expect(waiting.rating.review).toMatch(/\(4\/5\)/);

    const single = buildBenefitReport(
      sample({
        mode: "official",
        score: 1,
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
    );
    expect(single.verdict.recommendation).toBe("inconclusive");
    expect(single.verdict.headline).toMatch(/paired Comparison/i);
    expect(single.rating.review).not.toMatch(/fit for use/i);
    expect(single.rating.review).not.toMatch(/\(5\/5\)/);
  });

  it("does not give 5 stars on smoke, failed, or role-less official scores", () => {
    const smoke = buildBenefitReport(
      sample({
        mode: "official",
        score: 1,
        modelId: "gpt-4.1-mini",
        repeats: 3,
        capture: {
          role: "candidate",
          skillVersion: "abc123",
          dependencies: [],
          env: { fakeProduce: true },
        },
      }),
    );
    expect(smoke.rating.stars).toBe(1);
    expect(smoke.verdict.recommendation).toBe("inconclusive");

    const failed = buildBenefitReport(
      sample({
        mode: "official",
        score: 1,
        status: "failed",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
    );
    expect(failed.rating.stars).toBe(1);
    expect(failed.verdict.recommendation).toBe("do_not_use");

    const base = sample({
      mode: "official",
      score: 1,
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const { role: _drop, ...rest } = base;
    const roleless = buildBenefitReport(rest as RunResult);
    expect(roleless.rating.stars).toBe(1);
    expect(roleless.verdict.recommendation).toBe("inconclusive");
  });

  it("aligns rating prose with USE for official ≥0.99 + Comparison PASS", () => {
    const report = buildBenefitReport(
      sample({
        mode: "official",
        score: 0.995,
        modelId: "gpt-4.1-mini",
        repeats: 3,
        evaluationId: "eval_test",
        perTask: [
          {
            taskId: "bug-01",
            scriptResults: [],
            score: 0.995,
            status: "ok",
          },
        ],
      }),
      { comparison: comparisonStub("PASS") },
    );
    expect(report.verdict.recommendation).toBe("use");
    expect(report.rating.stars).toBe(5);
    expect(report.rating.summary).toMatch(/Official passed/i);
    expect(report.rating.review).not.toMatch(/short of USE/i);
    expect(report.rating.review).not.toMatch(/Do not adopt the skill yet/i);
  });

  it("applyPairedComparisonGate keeps USE on PASS only", () => {
    const result = sample({
      mode: "official",
      score: 1,
      modelId: "gpt-4.1-mini",
      repeats: 3,
      evaluationId: "eval_test",
    });
    const verdict = decideSkillUse(result);
    const rating = rateSkill(result);
    expect(verdict.recommendation).toBe("use");
    expect(rating.stars).toBe(5);

    const pass = applyPairedComparisonGate({
      result,
      verdict,
      rating,
      comparison: comparisonStub("PASS"),
    });
    expect(pass.verdict.recommendation).toBe("use");
    expect(pass.rating.stars).toBe(5);

    const inc = applyPairedComparisonGate({
      result,
      verdict,
      rating,
      comparison: comparisonStub("INCONCLUSIVE"),
    });
    expect(inc.verdict.recommendation).toBe("inconclusive");
    expect(inc.rating.stars).toBe(4);
  });

  it("counts soft-pass tasks (>= 0.8) as passed", () => {
    const report = buildBenefitReport(
      sample({
        score: 0.9,
        perTask: [
          {
            taskId: "bug-01",
            scriptResults: [],
            score: 0.9,
            status: "ok",
          },
        ],
      }),
    );
    expect(report.scorecard.tasksPassed).toBe(1);
    expect(report.rating.review).toMatch(/1\/1 soft-pass/);
    expect(report.rating.summary).toMatch(/Soft-pass complete/i);
    expect(report.rating.review).toMatch(/Benefit USE/i);
  });
});
