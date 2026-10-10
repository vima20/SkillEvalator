import { describe, expect, it } from "vitest";
import {
  buildBenefitReport,
  benefitReportToMarkdown,
  decideSkillUse,
} from "./benefitReport.js";
import type { RunResult } from "./schema.js";

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
    expect(v.headline).toMatch(/KÄYTÄ/);
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
    expect(report.rating.grade).toBe("Hyvä");
    expect(report.rating.starsDisplay).toBe("★★★★☆");
    expect(report.rating.reviewSections.map((s) => s.heading)).toEqual(
      expect.arrayContaining(["Tulos", "Mitä tämä kertoo", "Suositus", "Rajoite"]),
    );
    expect(report.rating.review).not.toMatch(/^Kirjallinen arvio:/);
    const md = benefitReportToMarkdown(report);
    expect(md).toContain("## Tuomio / Verdict");
    expect(md).toContain("## Tähtiarvio / Rating");
    expect(md).toContain("## Kirjallinen arvio");
    expect(md).toContain("### Suositus");
    expect(md).toContain("INCONCLUSIVE");
    expect(md).toMatch(/not proof of Cursor\/KH/i);
  });

  it("gives 5 stars only on official pass", () => {
    const report = buildBenefitReport(
      sample({ mode: "official", score: 1, modelId: "gpt-4.1-mini", repeats: 3 }),
    );
    expect(report.rating.stars).toBe(5);
    expect(report.rating.grade).toBe("Erinomainen");
  });
});
