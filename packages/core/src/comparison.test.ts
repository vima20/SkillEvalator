import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LIFT_PASS_DELTA,
  compareBaselineCandidate,
  loadPairedComparison,
  pairEvaluationRuns,
  resolveComparisonLegs,
  resolveEvaluationMetaEvalSkillId,
  resolveEvaluationMetaEvaluationId,
  resolveEvaluationMetaMode,
  resolvePairedCancelSibling,
} from "./comparison.js";
import { writeJsonFile } from "./fsJson.js";
import { jobAttestationFromRunResult } from "./jobSnapshot.js";
import { hashPromptInstruction } from "./promptSnapshot.js";
import { saveRetryMarker } from "./retryDedup.js";
import type { RunResult } from "./schema.js";

const pairedTemps: string[] = [];
afterEach(() => {
  for (const d of pairedTemps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function sample(over: Partial<RunResult> & Pick<RunResult, "runId" | "role">): RunResult {
  const { runId, role, ...rest } = over;
  const resolvedRole = role ?? "candidate";
  const defaultCapture = {
    githubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    commit: "deadbeef",
    license: "MIT",
    dependencies: [] as string[],
    skillVersion: "abc",
    role: resolvedRole,
    promptHash:
      resolvedRole === "baseline" ? "baselinehash0001" : "candidatehash0002",
    promptKind:
      resolvedRole === "baseline"
        ? ("baseline_neutral" as const)
        : ("skill_md" as const),
    env: {
      // Matching pins so official PASS tests do not launder missing provenance.
      gradeHash: "gradehash0000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
  const score = rest.score !== undefined ? rest.score : 0.9;
  const taskIds = rest.taskIds ?? ["bug-01"];
  const status = rest.status ?? "ok";
  const defaultPerTask = taskIds.map((taskId) => ({
    taskId,
    scriptResults: [{ name: "grade", exitCode: 0, summary: "ok" }],
    score:
      typeof score === "number" && Number.isFinite(score)
        ? score
        : status === "ok"
          ? 0.9
          : null,
    status:
      status === "cancelled" || status === "budget_stop"
        ? status
        : typeof score === "number" && score >= 0.8
          ? ("ok" as const)
          : ("failed" as const),
  }));
  return {
    evalSkillId: "code-debugging-eval",
    evalSkillVersion: "abc",
    evalSkillGithubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    evaluationId: "eval_test_1",
    taskSetId: "cde-v1",
    pipeline: { produce: "model", grade: "docker_script" },
    modelId: "gpt-4o-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: 1,
    aggregate: "mean",
    score,
    subscores: {},
    rationale: "",
    findings: [],
    costUsd: 0.01,
    latencyMs: 1000,
    status,
    startedAt: "2026-10-12T00:00:00.000Z",
    finishedAt: "2026-10-12T00:01:00.000Z",
    mode: "dry-run",
    ...rest,
    runId,
    role: resolvedRole,
    taskIds: rest.taskIds ?? taskIds,
    perTask: rest.perTask ?? defaultPerTask,
    // Default provenance for official PASS; explicit capture is used as-is
    // (parity tests must omit fields without default fill-in).
    capture: rest.capture
      ? { ...rest.capture, role: rest.capture.role ?? resolvedRole }
      : defaultCapture,
    // Live-produce attestation: default tokens unless the test overrides.
    tokens:
      rest.tokens !== undefined
        ? rest.tokens
        : { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
  };
}

/** Trusted pins matching sample() defaultCapture hashes. */
const TRUSTED_GRADE_HASH =
  "gradehash0000001aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TRUSTED_BASELINE_PROMPT_HASH = "baselinehash0001";
const TRUSTED_CANDIDATE_PROMPT_HASH = "candidatehash0002";
const OFFICIAL_PINS = {
  expectedGradeHash: TRUSTED_GRADE_HASH,
  expectedBaselinePromptHash: TRUSTED_BASELINE_PROMPT_HASH,
  expectedCandidatePromptHash: TRUSTED_CANDIDATE_PROMPT_HASH,
  expectedBaselineEvalSkillVersion: "abc",
  expectedCandidateEvalSkillVersion: "abc",
  expectedBaselinePromptKind: "baseline_neutral" as const,
  expectedCandidatePromptKind: "skill_md" as const,
};

function officialOpts(
  baseline: RunResult,
  candidate: RunResult,
  extra: Record<string, unknown> = {},
) {
  return {
    ...OFFICIAL_PINS,
    expectedBaselineJob: jobAttestationFromRunResult(baseline)!,
    expectedCandidateJob: jobAttestationFromRunResult(candidate)!,
    ...extra,
  };
}

describe("compareBaselineCandidate", () => {
  it("dry-run lift is INCONCLUSIVE (not adoption PASS)", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.7 }),
      sample({ runId: "c", role: "candidate", score: 0.85 }),
    );
    expect(c.mode).toBe("dry-run");
    expect(c.lift).toBeCloseTo(0.15);
    expect(c.lift!).toBeGreaterThanOrEqual(LIFT_PASS_DELTA);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.rationale).toMatch(/dry-run|official/i);
  });

  it("official FAIL when soft-pass + lift but score below USE floor", () => {
    const b = sample({
      runId: "b",
      role: "baseline",
      score: 0.8,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 0.9,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const c = compareBaselineCandidate(b, cand, officialOpts(b, cand));
    expect(c.lift!).toBeGreaterThanOrEqual(LIFT_PASS_DELTA);
    expect(c.verdict).toBe("FAIL");
    expect(c.rationale).toMatch(/USE floor|0\.99/i);
  });

  it("official PASS when score meets USE floor and lift clears delta", () => {
    const b = sample({
      runId: "b",
      role: "baseline",
      score: 0.9,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 1,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const c = compareBaselineCandidate(b, cand, officialOpts(b, cand));
    expect(c.verdict).toBe("PASS");
    expect(c.lift!).toBeGreaterThanOrEqual(LIFT_PASS_DELTA);
  });

  it("official INCONCLUSIVE when perTask is empty despite taskIds + run score", () => {
    const b = sample({
      runId: "b",
      role: "baseline",
      score: 0.9,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      perTask: [],
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 1,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      perTask: [],
    });
    const c = compareBaselineCandidate(b, cand, officialOpts(b, cand));
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /perTask missing taskId/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when run score disagrees with perTask mean", () => {
    const b = sample({
      runId: "b",
      role: "baseline",
      score: 0.9,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 1,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      perTask: [
        {
          taskId: "bug-01",
          score: 0.5,
          status: "failed",
          scriptResults: [],
        },
      ],
    });
    const c = compareBaselineCandidate(b, cand, officialOpts(b, cand));
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /run score .* ≠ perTask mean/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when perTask has duplicate taskId", () => {
    const b = sample({
      runId: "b",
      role: "baseline",
      score: 0.9,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 1,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      perTask: [
        {
          taskId: "bug-01",
          score: 1,
          status: "ok",
          scriptResults: [],
        },
        {
          taskId: "bug-01",
          score: 0.5,
          status: "failed",
          scriptResults: [],
        },
      ],
    });
    const c = compareBaselineCandidate(b, cand, officialOpts(b, cand));
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /perTask duplicate taskId/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when result.repeats ≠ skill-snapshot/job.json", () => {
    const b = sample({
      runId: "b",
      role: "baseline",
      score: 0.9,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 1,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const forgedCand = { ...cand, repeats: 1 };
    const c = compareBaselineCandidate(
      b,
      forgedCand,
      officialOpts(b, cand), // job still attests repeats=3
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        /candidate\.repeats ≠ skill-snapshot\/job\.json/i.test(i),
      ),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when evalSkillVersion ≠ trusted skill-snapshot manifest", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        evalSkillVersion: "forged_sha",
        capture: {
          ...sample({ runId: "b", role: "baseline" }).capture!,
          skillVersion: "forged_sha",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        evalSkillVersion: "forged_sha",
        capture: {
          ...sample({ runId: "c", role: "candidate" }).capture!,
          skillVersion: "forged_sha",
        },
      }),
      OFFICIAL_PINS,
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        /evalSkillVersion ≠ trusted skill-snapshot/i.test(i),
      ),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when promptKind ≠ trusted skill-snapshot manifest", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      {
        ...OFFICIAL_PINS,
        expectedCandidatePromptKind: "baseline_neutral",
      },
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        /candidate\.capture\.promptKind ≠ trusted skill-snapshot/i.test(i),
      ),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when promptHash ≠ trusted skill-snapshot pin", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      {
        ...OFFICIAL_PINS,
        expectedCandidatePromptHash: "snapshot_real_prompt_xx",
      },
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        /candidate\.capture\.promptHash ≠ trusted skill-snapshot/i.test(i),
      ),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when trusted prompt pins missing (no skill-snapshot SKILL.md)", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      { expectedGradeHash: TRUSTED_GRADE_HASH },
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        /trusted expectedBaselinePromptHash/i.test(i),
      ),
    ).toBe(true);
    expect(
      c.parity.issues.some((i) =>
        /trusted expectedCandidatePromptHash/i.test(i),
      ),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when produceAttested missing (fixture plant)", () => {
    const stripAttest = (role: "baseline" | "candidate", runId: string) => {
      const r = sample({
        runId,
        role,
        score: role === "baseline" ? 0.9 : 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      });
      const { produceAttested: _drop, ...envRest } = r.capture!.env!;
      return {
        ...r,
        capture: { ...r.capture!, env: envRest },
      };
    };
    const c = compareBaselineCandidate(
      stripAttest("baseline", "b"),
      stripAttest("candidate", "c"),
      OFFICIAL_PINS,
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /produceAttested=true/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when tokens.totalTokens is 0 (no live produce)", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
      OFFICIAL_PINS,
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /tokens\.totalTokens > 0/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when smoke harness finding present", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        findings: ["smoke-official-adoption"],
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        findings: ["smoke-official-adoption"],
      }),
      OFFICIAL_PINS,
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /smoke harness finding/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when expectedGradeHash missing (forged leg match)", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /trusted expectedGradeHash/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when legs share forged gradeHash ≠ trusted", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.9,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      }),
      {
        ...OFFICIAL_PINS,
        expectedGradeHash: "trusted_real_gradehash_bbbbbbbbbbbbbbbbbbbb",
      },
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /≠ trusted expectedGradeHash/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when both legs omit promptKind (legacy laundering)", () => {
    const stripKind = (role: "baseline" | "candidate", runId: string) => {
      const r = sample({
        runId,
        role,
        score: role === "baseline" ? 0.9 : 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      });
      const { promptKind: _drop, ...captureRest } = r.capture!;
      return { ...r, capture: captureRest };
    };
    const c = compareBaselineCandidate(
      stripKind("baseline", "b"),
      stripKind("candidate", "c"),
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.issues.some((i) => /promptKind/i.test(i))).toBe(true);
  });

  it("official INCONCLUSIVE when both legs omit gradeHash (legacy laundering)", () => {
    const stripHash = (role: "baseline" | "candidate", runId: string) => {
      const r = sample({
        runId,
        role,
        score: role === "baseline" ? 0.9 : 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      });
      const { gradeHash: _drop, ...envRest } = r.capture!.env!;
      return {
        ...r,
        capture: { ...r.capture!, env: envRest },
      };
    };
    const c = compareBaselineCandidate(
      stripHash("baseline", "b"),
      stripHash("candidate", "c"),
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.issues.some((i) => /gradeHash/i.test(i))).toBe(true);
  });

  it("official INCONCLUSIVE when promptHash or env.grade pins are missing", () => {
    const stripPromptHash = (role: "baseline" | "candidate", runId: string) => {
      const r = sample({
        runId,
        role,
        score: role === "baseline" ? 0.9 : 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      });
      const { promptHash: _ph, ...capRest } = r.capture!;
      return { ...r, capture: capRest };
    };
    const noHash = compareBaselineCandidate(
      stripPromptHash("baseline", "b"),
      stripPromptHash("candidate", "c"),
      OFFICIAL_PINS,
    );
    expect(noHash.verdict).toBe("INCONCLUSIVE");
    expect(
      noHash.parity.issues.some((i) => /promptHash/i.test(i)),
    ).toBe(true);

    const stripGrade = (role: "baseline" | "candidate", runId: string) => {
      const r = sample({
        runId,
        role,
        score: role === "baseline" ? 0.9 : 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      });
      const { grade: _g, ...envRest } = r.capture!.env!;
      return {
        ...r,
        capture: { ...r.capture!, env: envRest },
      };
    };
    const noGrade = compareBaselineCandidate(
      stripGrade("baseline", "b"),
      stripGrade("candidate", "c"),
      OFFICIAL_PINS,
    );
    expect(noGrade.verdict).toBe("INCONCLUSIVE");
    expect(
      noGrade.parity.issues.some((i) => /capture\.env\.grade/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when fakeProduce/cost/allowHostGrade env pins are missing", () => {
    const stripSmokeCost = (role: "baseline" | "candidate", runId: string) => {
      const r = sample({
        runId,
        role,
        score: role === "baseline" ? 0.9 : 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
      });
      const {
        fakeProduce: _fp,
        costCapUsd: _cap,
        costHardStop: _stop,
        allowHostGrade: _host,
        ...envRest
      } = r.capture!.env!;
      return {
        ...r,
        capture: { ...r.capture!, env: envRest },
      };
    };
    const c = compareBaselineCandidate(
      stripSmokeCost("baseline", "b"),
      stripSmokeCost("candidate", "c"),
    );
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => /fakeProduce=false/i.test(i)),
    ).toBe(true);
    expect(c.parity.issues.some((i) => /costCapUsd/i.test(i))).toBe(true);
    expect(c.parity.issues.some((i) => /costHardStop/i.test(i))).toBe(true);
    expect(c.parity.issues.some((i) => /allowHostGrade=false/i.test(i))).toBe(
      true,
    );
  });

  it("official INCONCLUSIVE when allowHostGrade is true or grade is not docker_script", () => {
    const hostOk = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        capture: {
          ...sample({ runId: "b", role: "baseline" }).capture!,
          env: {
            ...sample({ runId: "b", role: "baseline" }).capture!.env!,
            allowHostGrade: true,
            grade: "docker_script",
          },
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        capture: {
          ...sample({ runId: "c", role: "candidate" }).capture!,
          env: {
            ...sample({ runId: "c", role: "candidate" }).capture!.env!,
            allowHostGrade: true,
            grade: "docker_script",
          },
        },
      }),
    );
    expect(hostOk.verdict).toBe("INCONCLUSIVE");
    expect(
      hostOk.parity.issues.some((i) => /allowHostGrade=false/i.test(i)),
    ).toBe(true);

    const hostGrade = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        pipeline: { produce: "model", grade: "host_script" },
        capture: {
          ...sample({ runId: "b", role: "baseline" }).capture!,
          env: {
            ...sample({ runId: "b", role: "baseline" }).capture!.env!,
            grade: "host_script",
          },
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 1,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        pipeline: { produce: "model", grade: "host_script" },
        capture: {
          ...sample({ runId: "c", role: "candidate" }).capture!,
          env: {
            ...sample({ runId: "c", role: "candidate" }).capture!.env!,
            grade: "host_script",
          },
        },
      }),
    );
    expect(hostGrade.verdict).toBe("INCONCLUSIVE");
    expect(
      hostGrade.parity.issues.some((i) => /grade=docker_script/i.test(i)),
    ).toBe(true);
  });

  it("official INCONCLUSIVE when candidate.role is missing (no invent)", () => {
    const base = sample({
      runId: "b",
      role: "baseline",
      score: 0.9,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 1,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const { role: _drop, ...candRest } = cand;
    const c = compareBaselineCandidate(base, candRest as RunResult);
    expect(c.parity.ok).toBe(false);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        i.includes("expected candidate.role=candidate"),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when both legs used fakeProduce smoke", () => {
    const smokeEnv = {
      fakeProduce: true as const,
      modelDryRun: "gpt-4o-mini",
      modelOfficial: "gpt-4.1-mini",
    };
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.7,
        capture: {
          githubUrl:
            "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
          commit: "deadbeef",
          license: "MIT",
          dependencies: [],
          skillVersion: "abc",
          role: "baseline",
          promptHash: "baselinehash0001",
          promptKind: "baseline_neutral",
          env: smokeEnv,
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.85,
        capture: {
          githubUrl:
            "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
          commit: "deadbeef",
          license: "MIT",
          dependencies: [],
          skillVersion: "abc",
          role: "candidate",
          promptHash: "candidatehash0002",
          promptKind: "skill_md",
          env: smokeEnv,
        },
      }),
    );
    expect(c.parity.ok).toBe(true);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.rationale).toMatch(/FAKE_PRODUCE|smoke/i);
  });

  it("dry-run small lift is INCONCLUSIVE (not adoption FAIL)", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.9 }),
      sample({ runId: "c", role: "candidate", score: 0.92 }),
    );
    expect(c.mode).toBe("dry-run");
    expect(c.lift).toBeCloseTo(0.02);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.rationale).toMatch(/dry-run|official/i);
  });

  it("official FAIL when lift too small", () => {
    const b = sample({
      runId: "b",
      role: "baseline",
      score: 0.95,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 0.995,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const c = compareBaselineCandidate(b, cand, officialOpts(b, cand));
    expect(c.lift!).toBeLessThan(LIFT_PASS_DELTA);
    expect(c.verdict).toBe("FAIL");
  });

  it("dry-run soft-pass miss is INCONCLUSIVE (not adoption FAIL)", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.2 }),
      sample({ runId: "c", role: "candidate", score: 0.5 }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
  });

  it("official FAIL when candidate below soft-pass floor", () => {
    const b = sample({
      runId: "b",
      role: "baseline",
      score: 0.2,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const cand = sample({
      runId: "c",
      role: "candidate",
      score: 0.5,
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
    });
    const c = compareBaselineCandidate(b, cand, officialOpts(b, cand));
    expect(c.verdict).toBe("FAIL");
  });

  it("INCONCLUSIVE on cancelled", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5, status: "cancelled" }),
      sample({ runId: "c", role: "candidate", score: 0.9 }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
  });

  it("INCONCLUSIVE when a leg status is failed despite scores", () => {
    const failedCand = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5 }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        status: "failed",
      }),
    );
    expect(failedCand.verdict).toBe("INCONCLUSIVE");
    expect(failedCand.rationale).toMatch(/failed|incomplete/i);

    // Failed baseline must not yield PASS via lift against an ok candidate.
    const failedBase = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.4,
        status: "failed",
      }),
      sample({ runId: "c", role: "candidate", score: 0.95 }),
    );
    expect(failedBase.verdict).toBe("INCONCLUSIVE");
  });

  it("INCONCLUSIVE on parity mismatch", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5, modelId: "gpt-4o-mini" }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        modelId: "gpt-4.1-mini",
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.ok).toBe(false);
    expect(c.parity.issues.some((i) => i.includes("modelId"))).toBe(true);
  });

  it("INCONCLUSIVE when evalSkillId differs on shared task set", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evalSkillId: "code-debugging-eval",
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evalSkillId: "code-debugging-eval-checklist",
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.ok).toBe(false);
    expect(c.parity.issues.some((i) => i.includes("evalSkillId"))).toBe(true);
  });

  it("INCONCLUSIVE when evalSkillVersion drifts between legs", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evalSkillVersion: "aaaa",
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evalSkillVersion: "bbbb",
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.ok).toBe(false);
    expect(c.parity.issues.some((i) => i.includes("evalSkillVersion"))).toBe(
      true,
    );
  });

  it("INCONCLUSIVE when capture.license or githubUrl differs on both legs", () => {
    const capture = (over: { license?: string; githubUrl?: string }) => ({
      githubUrl: over.githubUrl ?? "https://github.com/acme/skills",
      commit: "aaaaaaaaaaaaaaaa",
      license: over.license ?? "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role: "candidate" as const,
      promptHash: "ph",
      promptPreview: "preview",
      promptKind: "skill_md" as const,
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
        grade: "docker_script" as const,
      },
      capturedAt: "2026-10-12T00:00:00.000Z",
    });
    const lic = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: {
          ...capture({ license: "MIT" }),
          role: "baseline",
          promptKind: "baseline_neutral",
          promptHash: "base",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: {
          ...capture({ license: "Apache-2.0" }),
          promptHash: "cand",
        },
      }),
    );
    expect(lic.verdict).toBe("INCONCLUSIVE");
    expect(lic.parity.issues.some((i) => i.includes("capture.license"))).toBe(
      true,
    );

    const gh = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: {
          ...capture({ githubUrl: "https://github.com/acme/a" }),
          role: "baseline",
          promptKind: "baseline_neutral",
          promptHash: "base",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: {
          ...capture({ githubUrl: "https://github.com/acme/b" }),
          promptHash: "cand",
        },
      }),
    );
    expect(gh.verdict).toBe("INCONCLUSIVE");
    expect(
      gh.parity.issues.some((i) => i.includes("capture.githubUrl")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.env temperature/topP/seed presence is one-sided", () => {
    const baseEnv = {
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
      grade: "docker_script" as const,
    };
    const { temperature: _t, ...noTemp } = baseEnv;
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: {
          githubUrl: "https://github.com/acme/skills",
          commit: "aaaaaaaaaaaaaaaa",
          license: "MIT",
          dependencies: [],
          skillVersion: "abc",
          role: "baseline",
          promptHash: "basehash",
          promptKind: "baseline_neutral",
          env: baseEnv,
          capturedAt: "2026-10-12T00:00:00.000Z",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: {
          githubUrl: "https://github.com/acme/skills",
          commit: "aaaaaaaaaaaaaaaa",
          license: "MIT",
          dependencies: [],
          skillVersion: "abc",
          role: "candidate",
          promptHash: "candhash",
          promptKind: "skill_md",
          env: noTemp,
          capturedAt: "2026-10-12T00:00:00.000Z",
        },
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("temperature presence")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.commit differs on both legs", () => {
    const capture = (commit: string) => ({
      githubUrl: "https://github.com/acme/skills",
      commit,
      license: "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role: "candidate" as const,
      promptHash: "ph",
      promptPreview: "preview",
      promptKind: "skill_md" as const,
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
        grade: "docker_script" as const,
      },
      capturedAt: "2026-10-12T00:00:00.000Z",
    });
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: { ...capture("aaaaaaaaaaaaaaaa"), role: "baseline" },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture("bbbbbbbbbbbbbbbb"),
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.ok).toBe(false);
    expect(c.parity.issues.some((i) => i.includes("capture.commit"))).toBe(
      true,
    );
  });

  it("INCONCLUSIVE when evaluationId presence is one-sided", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evaluationId: "eval_only_base",
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evaluationId: undefined,
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("evaluationId presence")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.skillVersion disagrees with evalSkillVersion", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evalSkillVersion: "abc",
        capture: {
          skillVersion: "drifted",
          role: "baseline",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evalSkillVersion: "abc",
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
          promptKind: "skill_md",
        },
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        i.includes("baseline.capture.skillVersion"),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when decoding disagrees with capture.env on a leg", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        decoding: { temperature: 0, top_p: 1, seed: 42 },
        capture: {
          skillVersion: "abc",
          role: "baseline",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
          env: {
            modelDryRun: "gpt-4o-mini",
            modelOfficial: "gpt-4.1-mini",
            temperature: 0.7,
            topP: 1,
            seed: 42,
            maxOutputTokens: 1024,
            costCapUsd: 5,
            costHardStop: true,
            fakeProduce: false,
            allowHostGrade: false,
            grade: "docker_script",
          },
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        decoding: { temperature: 0, top_p: 1, seed: 42 },
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
          promptKind: "skill_md",
          env: {
            modelDryRun: "gpt-4o-mini",
            modelOfficial: "gpt-4.1-mini",
            temperature: 0,
            topP: 1,
            seed: 42,
            maxOutputTokens: 1024,
            costCapUsd: 5,
            costHardStop: true,
            fakeProduce: false,
            allowHostGrade: false,
            grade: "docker_script",
          },
        },
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        i.includes("baseline.decoding.temperature"),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.env.grade drifts from pipeline.grade", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        pipeline: { produce: "model", grade: "docker_script" },
        capture: {
          skillVersion: "abc",
          role: "baseline",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
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
            grade: "host_script",
          },
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        pipeline: { produce: "model", grade: "docker_script" },
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
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
        },
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        i.includes("baseline.capture.env.grade"),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.role disagrees with result.role", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
          promptKind: "skill_md",
        },
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        i.includes("baseline.capture.role"),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when dry-run uses official modelId (mode↔env pin)", () => {
    const env = {
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
      grade: "docker_script" as const,
    };
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        mode: "dry-run",
        modelId: "gpt-4.1-mini",
        capture: {
          skillVersion: "abc",
          role: "baseline",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
          env,
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        mode: "dry-run",
        modelId: "gpt-4.1-mini",
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
          promptKind: "skill_md",
          env,
        },
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        i.includes("≠ capture.env.modelDryRun"),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when official repeats are below the floor", () => {
    const env = {
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
      grade: "docker_script" as const,
    };
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 1,
        capture: {
          skillVersion: "abc",
          role: "baseline",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
          env,
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 1,
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
          promptKind: "skill_md",
          env,
        },
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("official minimum")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.githubUrl disagrees with evalSkillGithubUrl", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evalSkillGithubUrl: "https://github.com/acme/a",
        capture: {
          skillVersion: "abc",
          role: "baseline",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
          githubUrl: "https://github.com/acme/b",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evalSkillGithubUrl: "https://github.com/acme/a",
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
          promptKind: "skill_md",
          githubUrl: "https://github.com/acme/a",
        },
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) =>
        i.includes("baseline.capture.githubUrl ≠ evalSkillGithubUrl"),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.env.gradeHash differs on both legs", () => {
    const withHash = (gradeHash: string) => ({
      githubUrl: "https://github.com/acme/skills",
      commit: "aaaaaaaaaaaaaaaa",
      license: "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role: "candidate" as const,
      promptHash: "ph",
      promptPreview: "preview",
      promptKind: "skill_md" as const,
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
        grade: "docker_script" as const,
        gradeHash,
      },
      capturedAt: "2026-10-12T00:00:00.000Z",
    });
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: { ...withHash("aaa".repeat(21) + "aa"), role: "baseline" },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: withHash("bbb".repeat(21) + "bb"),
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.ok).toBe(false);
    expect(
      c.parity.issues.some((i) => i.includes("capture.env.gradeHash")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when only one leg has capture.env.gradeHash", () => {
    const baseEnv = {
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
      grade: "docker_script" as const,
    };
    const capture = (gradeHash?: string) => ({
      githubUrl: "https://github.com/acme/skills",
      commit: "aaaaaaaaaaaaaaaa",
      license: "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role: "candidate" as const,
      promptHash: "ph",
      promptPreview: "preview",
      promptKind: "skill_md" as const,
      env: gradeHash ? { ...baseEnv, gradeHash } : { ...baseEnv },
      capturedAt: "2026-10-12T00:00:00.000Z",
    });
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: {
          ...capture("aaa".repeat(21) + "aa"),
          role: "baseline",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture(),
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("gradeHash presence")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when maxOutputTokens differs on both legs", () => {
    const env = (maxOutputTokens: number) => ({
      githubUrl: "https://github.com/acme/skills",
      commit: "aaaaaaaaaaaaaaaa",
      license: "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role: "candidate" as const,
      promptHash: "ph",
      promptPreview: "preview",
      promptKind: "skill_md" as const,
      env: {
        modelDryRun: "gpt-4o-mini",
        modelOfficial: "gpt-4.1-mini",
        temperature: 0,
        topP: 1,
        seed: 1,
        maxOutputTokens,
        costCapUsd: 5,
        costHardStop: true,
        fakeProduce: false,
        allowHostGrade: false,
        grade: "docker_script" as const,
      },
      capturedAt: "2026-10-12T00:00:00.000Z",
    });
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: { ...env(512), role: "baseline" },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: env(2048),
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("maxOutputTokens")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when fakeProduce, costCapUsd, costHardStop, or allowHostGrade differs", () => {
    const env = (over: {
      fakeProduce?: boolean;
      costCapUsd?: number;
      costHardStop?: boolean;
      allowHostGrade?: boolean;
    }) => ({
      githubUrl: "https://github.com/acme/skills",
      commit: "aaaaaaaaaaaaaaaa",
      license: "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role: "candidate" as const,
      promptHash: "ph",
      promptPreview: "preview",
      promptKind: "skill_md" as const,
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
        grade: "docker_script" as const,
        ...over,
      },
      capturedAt: "2026-10-12T00:00:00.000Z",
    });
    const fakeMix = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: { ...env({ fakeProduce: true }), role: "baseline" },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: env({ fakeProduce: false }),
      }),
    );
    expect(fakeMix.verdict).toBe("INCONCLUSIVE");
    expect(
      fakeMix.parity.issues.some((i) => i.includes("fakeProduce")),
    ).toBe(true);

    const capMix = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: { ...env({ costCapUsd: 1 }), role: "baseline" },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: env({ costCapUsd: 5 }),
      }),
    );
    expect(capMix.verdict).toBe("INCONCLUSIVE");
    expect(
      capMix.parity.issues.some((i) => i.includes("costCapUsd")),
    ).toBe(true);

    const hardStopMix = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: { ...env({ costHardStop: true }), role: "baseline" },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: env({ costHardStop: false }),
      }),
    );
    expect(hardStopMix.verdict).toBe("INCONCLUSIVE");
    expect(
      hardStopMix.parity.issues.some((i) => i.includes("costHardStop")),
    ).toBe(true);

    const hostGradeMix = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: { ...env({ allowHostGrade: true }), role: "baseline" },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: env({ allowHostGrade: false }),
      }),
    );
    expect(hostGradeMix.verdict).toBe("INCONCLUSIVE");
    expect(
      hostGradeMix.parity.issues.some((i) => i.includes("allowHostGrade")),
    ).toBe(true);
  });

  it("INCONCLUSIVE on one-sided capture.env cost/smoke field presence", () => {
    const fullEnv = {
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
      grade: "docker_script" as const,
    };
    const capture = (env: Record<string, unknown> | undefined, role: "baseline" | "candidate") => ({
      githubUrl: "https://github.com/acme/skills",
      commit: "aaaaaaaaaaaaaaaa",
      license: "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role,
      promptHash: "ph",
      promptPreview: "preview",
      promptKind:
        role === "baseline"
          ? ("baseline_neutral" as const)
          : ("skill_md" as const),
      ...(env ? { env } : {}),
      capturedAt: "2026-10-12T00:00:00.000Z",
    });

    const fakeXor = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: capture(fullEnv, "baseline"),
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture(
          {
            modelDryRun: "gpt-4o-mini",
            modelOfficial: "gpt-4.1-mini",
            temperature: 0,
            topP: 1,
            seed: 1,
            maxOutputTokens: 1024,
            costCapUsd: 5,
            costHardStop: true,
            allowHostGrade: false,
            grade: "docker_script",
          },
          "candidate",
        ),
      }),
    );
    expect(fakeXor.verdict).toBe("INCONCLUSIVE");
    expect(
      fakeXor.parity.issues.some((i) =>
        i.includes("fakeProduce presence mismatch"),
      ),
    ).toBe(true);

    const hardStopXor = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: capture(
          {
            modelDryRun: "gpt-4o-mini",
            modelOfficial: "gpt-4.1-mini",
            temperature: 0,
            topP: 1,
            seed: 1,
            maxOutputTokens: 1024,
            costCapUsd: 5,
            fakeProduce: false,
            allowHostGrade: false,
            grade: "docker_script",
          },
          "baseline",
        ),
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture(fullEnv, "candidate"),
      }),
    );
    expect(
      hardStopXor.parity.issues.some((i) =>
        i.includes("costHardStop presence mismatch"),
      ),
    ).toBe(true);

    const maxTokXor = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: capture(
          {
            modelDryRun: "gpt-4o-mini",
            modelOfficial: "gpt-4.1-mini",
            temperature: 0,
            topP: 1,
            seed: 1,
            costCapUsd: 5,
            costHardStop: true,
            fakeProduce: false,
            allowHostGrade: false,
            grade: "docker_script",
          },
          "baseline",
        ),
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture(fullEnv, "candidate"),
      }),
    );
    expect(
      maxTokXor.parity.issues.some((i) =>
        i.includes("maxOutputTokens presence mismatch"),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.promptHash is identical or one-sided", () => {
    const capture = (
      role: "baseline" | "candidate",
      promptHash?: string,
    ) => ({
      githubUrl: "https://github.com/acme/skills",
      commit: "aaaaaaaaaaaaaaaa",
      license: "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role,
      ...(promptHash !== undefined ? { promptHash } : {}),
      promptPreview: "preview",
      promptKind:
        role === "baseline"
          ? ("baseline_neutral" as const)
          : ("skill_md" as const),
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
        grade: "docker_script" as const,
      },
      capturedAt: "2026-10-12T00:00:00.000Z",
    });
    const same = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: capture("baseline", "samehash000001"),
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture("candidate", "samehash000001"),
      }),
    );
    expect(same.verdict).toBe("INCONCLUSIVE");
    expect(
      same.parity.issues.some((i) => i.includes("promptHash identical")),
    ).toBe(true);

    const xor = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: capture("baseline", "only-base"),
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture("candidate"),
      }),
    );
    expect(xor.verdict).toBe("INCONCLUSIVE");
    expect(
      xor.parity.issues.some((i) => i.includes("promptHash presence")),
    ).toBe(true);

    const distinct = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: capture("baseline", "neutral-hash"),
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture("candidate", "skill-hash"),
      }),
    );
    expect(
      distinct.parity.issues.some((i) => i.includes("promptHash")),
    ).toBe(false);
  });

  it("INCONCLUSIVE when promptKind presence is one-sided", () => {
    const env = {
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
      grade: "docker_script" as const,
    };
    const baseline = sample({
      runId: "b",
      role: "baseline",
      score: 0.5,
      capture: {
        githubUrl: "https://github.com/acme/skills",
        commit: "aaaaaaaaaaaaaaaa",
        license: "MIT",
        dependencies: [],
        skillVersion: "abc",
        role: "baseline",
        promptHash: "basehash",
        promptKind: "baseline_neutral",
        env,
        capturedAt: "2026-10-12T00:00:00.000Z",
      },
    });
    const candidateFull = sample({
      runId: "c",
      role: "candidate",
      score: 0.95,
      capture: {
        githubUrl: "https://github.com/acme/skills",
        commit: "aaaaaaaaaaaaaaaa",
        license: "MIT",
        dependencies: [],
        skillVersion: "abc",
        role: "candidate",
        promptHash: "candhash",
        env,
        capturedAt: "2026-10-12T00:00:00.000Z",
      },
    });
    const { promptKind: _drop, ...candCapture } = candidateFull.capture!;
    const c = compareBaselineCandidate(baseline, {
      ...candidateFull,
      capture: candCapture,
    });
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("promptKind presence")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when promptKind disagrees with role", () => {
    const capture = (
      role: "baseline" | "candidate",
      promptKind: "baseline_neutral" | "skill_md",
    ) => ({
      githubUrl: "https://github.com/acme/skills",
      commit: "aaaaaaaaaaaaaaaa",
      license: "MIT",
      dependencies: [] as string[],
      skillVersion: "abc",
      role,
      promptHash: "ph",
      promptPreview: "preview",
      promptKind,
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
        grade: "docker_script" as const,
      },
      capturedAt: "2026-10-12T00:00:00.000Z",
    });
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: capture("baseline", "skill_md"),
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: capture("candidate", "baseline_neutral"),
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("baseline.capture.promptKind")),
    ).toBe(true);
    expect(
      c.parity.issues.some((i) => i.includes("candidate.capture.promptKind")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when capture.commit presence is one-sided; both missing OK", () => {
    const oneSided = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: {
          skillVersion: "abc",
          role: "baseline",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
          promptKind: "skill_md",
          commit: "only-candidate",
        },
      }),
    );
    expect(oneSided.verdict).toBe("INCONCLUSIVE");
    expect(
      oneSided.parity.issues.some((i) =>
        i.includes("capture.commit presence"),
      ),
    ).toBe(true);

    const bothMissing = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        capture: {
          skillVersion: "abc",
          role: "baseline",
          dependencies: [],
          promptHash: "base",
          promptKind: "baseline_neutral",
        },
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        capture: {
          skillVersion: "abc",
          role: "candidate",
          dependencies: [],
          promptHash: "cand",
          promptKind: "skill_md",
        },
      }),
    );
    expect(
      bothMissing.parity.issues.some((i) => i.includes("capture.commit")),
    ).toBe(false);
  });

  it("INCONCLUSIVE when legs disagree with evaluation meta evalSkillId", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evalSkillId: "code-debugging-eval",
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evalSkillId: "code-debugging-eval",
      }),
      { expectedEvalSkillId: "code-debugging-eval-checklist" },
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("evaluation meta")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when legs disagree with evaluation meta mode", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        mode: "dry-run",
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        mode: "dry-run",
      }),
      { expectedEvaluationMode: "official" },
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("evaluation meta mode")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when evaluation meta mode is explicitly invalid", () => {
    const pin = resolveEvaluationMetaMode({
      metaMode: "prod",
      baselineMode: "dry-run",
      candidateMode: "dry-run",
      evaluationMetaPresent: true,
    });
    expect(pin.expectedEvaluationMode).toBeUndefined();
    expect(pin.issues.some((i) => i.includes("invalid"))).toBe(true);

    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5, mode: "dry-run" }),
      sample({ runId: "c", role: "candidate", score: 0.95, mode: "dry-run" }),
      { extraParityIssues: pin.issues },
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
  });

  it("fills expected mode from agreeing legs when meta mode is missing", () => {
    const pin = resolveEvaluationMetaMode({
      metaMode: "",
      baselineMode: "dry-run",
      candidateMode: "dry-run",
      evaluationMetaPresent: true,
    });
    expect(pin.expectedEvaluationMode).toBe("dry-run");
    expect(pin.issues).toEqual([]);

    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5, mode: "dry-run" }),
      sample({ runId: "c", role: "candidate", score: 0.95, mode: "dry-run" }),
      { expectedEvaluationMode: pin.expectedEvaluationMode },
    );
    expect(c.parity.ok).toBe(true);
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.rationale).toMatch(/dry-run/i);
  });

  it("INCONCLUSIVE when evaluation meta evalSkillId is invalid", () => {
    const pin = resolveEvaluationMetaEvalSkillId({
      metaEvalSkillId: "../evil",
      baselineEvalSkillId: "code-debugging-eval",
      candidateEvalSkillId: "code-debugging-eval",
      evaluationMetaPresent: true,
    });
    expect(pin.expectedEvalSkillId).toBeUndefined();
    expect(pin.issues.some((i) => i.includes("invalid"))).toBe(true);

    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5 }),
      sample({ runId: "c", role: "candidate", score: 0.95 }),
      { extraParityIssues: pin.issues },
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
  });

  it("fills expected evalSkillId from agreeing legs when meta id is missing", () => {
    const pin = resolveEvaluationMetaEvalSkillId({
      metaEvalSkillId: "  ",
      baselineEvalSkillId: "code-debugging-eval",
      candidateEvalSkillId: "code-debugging-eval",
      evaluationMetaPresent: true,
    });
    expect(pin.expectedEvalSkillId).toBe("code-debugging-eval");
    expect(pin.issues).toEqual([]);
  });

  it("INCONCLUSIVE when evaluation meta evaluationId disagrees with folder pin", () => {
    const pin = resolveEvaluationMetaEvaluationId({
      folderEvaluationId: "eval_100_folder",
      metaEvaluationId: "eval_100_other",
      evaluationMetaPresent: true,
    });
    expect(pin.expectedEvaluationId).toBe("eval_100_folder");
    expect(pin.issues.some((i) => i.includes("folder"))).toBe(true);

    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evaluationId: "eval_100_other",
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evaluationId: "eval_100_other",
      }),
      {
        expectedEvaluationId: pin.expectedEvaluationId,
        extraParityIssues: pin.issues,
      },
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.evaluationId).toBe("eval_100_folder");
  });

  it("INCONCLUSIVE when decoding.seed or pipeline.grade differs", () => {
    const seedMismatch = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5 }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        decoding: { temperature: 0, top_p: 1, seed: 99 },
      }),
    );
    expect(seedMismatch.verdict).toBe("INCONCLUSIVE");
    expect(seedMismatch.parity.issues.some((i) => i.includes("seed"))).toBe(
      true,
    );

    const gradeMismatch = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5 }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        pipeline: { produce: "model", grade: "host_script" },
      }),
    );
    expect(gradeMismatch.verdict).toBe("INCONCLUSIVE");
    expect(
      gradeMismatch.parity.issues.some((i) => i.includes("pipeline.grade")),
    ).toBe(true);
  });

  it("flags per-task regressions", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.95,
        taskIds: ["bug-01", "bug-02"],
        perTask: [
          {
            taskId: "bug-01",
            score: 1,
            status: "ok",
            scriptResults: [],
          },
          {
            taskId: "bug-02",
            score: 0.9,
            status: "ok",
            scriptResults: [],
          },
        ],
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.75,
        taskIds: ["bug-01", "bug-02"],
        perTask: [
          {
            taskId: "bug-01",
            score: 0.5,
            status: "failed",
            scriptResults: [],
          },
          {
            taskId: "bug-02",
            score: 1,
            status: "ok",
            scriptResults: [],
          },
        ],
      }),
    );
    expect(c.regressions).toBe(1);
    expect(c.improvements).toBe(1);
    expect(c.perTask.find((t) => t.taskId === "bug-01")?.regression).toBe(true);
  });
});

describe("pairEvaluationRuns", () => {
  it("finds baseline and candidate", () => {
    const { baseline, candidate } = pairEvaluationRuns([
      sample({ runId: "c", role: "candidate" }),
      sample({ runId: "b", role: "baseline" }),
    ]);
    expect(baseline?.runId).toBe("b");
    expect(candidate?.runId).toBe("c");
  });

  it("picks the newest candidate when retries left multiple legs", () => {
    const { candidate } = pairEvaluationRuns([
      sample({
        runId: "run_old_cand",
        role: "candidate",
        startedAt: "2026-10-12T00:00:00.000Z",
        finishedAt: "2026-10-12T00:01:00.000Z",
      }),
      sample({
        runId: "run_new_cand",
        role: "candidate",
        startedAt: "2026-10-12T00:10:00.000Z",
        finishedAt: "2026-10-12T00:11:00.000Z",
      }),
      sample({ runId: "run_base", role: "baseline" }),
    ]);
    expect(candidate?.runId).toBe("run_new_cand");
  });
});

describe("resolveComparisonLegs", () => {
  it("does not fill a missing meta leg from older same-evaluation results", () => {
    const oldCand = sample({
      runId: "run_old_ok",
      role: "candidate",
      score: 0.95,
      status: "ok",
    });
    const base = sample({ runId: "run_base", role: "baseline", score: 0.7 });
    const byId = new Map<string, RunResult>([
      [base.runId, base],
      [oldCand.runId, oldCand],
    ]);

    const { baseline, candidate } = resolveComparisonLegs({
      meta: {
        baselineRunId: "run_base",
        candidateRunId: "run_retry_orphan",
      },
      loadResult: (id) => byId.get(id) ?? null,
      scanByEvaluationId: () => [base, oldCand],
    });

    expect(baseline?.runId).toBe("run_base");
    expect(candidate).toBeNull();
  });

  it("returns null legs when meta is missing (no scan invent)", () => {
    const base = sample({ runId: "run_base", role: "baseline" });
    const cand = sample({ runId: "run_cand", role: "candidate" });
    const { baseline, candidate } = resolveComparisonLegs({
      meta: null,
      loadResult: () => null,
      scanByEvaluationId: () => [cand, base],
    });
    expect(baseline).toBeNull();
    expect(candidate).toBeNull();
  });
});

describe("resolvePairedCancelSibling", () => {
  it("cascades only the opposite meta leg", () => {
    expect(
      resolvePairedCancelSibling({
        runId: "run_base",
        role: "baseline",
        meta: {
          baselineRunId: "run_base",
          candidateRunId: "run_cand",
        },
        peers: [
          { runId: "run_cand", role: "candidate", status: "running" },
          { runId: "run_old", role: "candidate", status: "running" },
        ],
      }),
    ).toBe("run_cand");
  });

  it("does not cascade when runId is superseded (not in meta)", () => {
    expect(
      resolvePairedCancelSibling({
        runId: "run_old_cand",
        role: "candidate",
        meta: {
          baselineRunId: "run_base",
          candidateRunId: "run_new_cand",
        },
        peers: [
          { runId: "run_base", role: "baseline", status: "running" },
          { runId: "run_new_cand", role: "candidate", status: "running" },
        ],
      }),
    ).toBeNull();
  });

  it("without meta cancels the sole live peer", () => {
    expect(
      resolvePairedCancelSibling({
        runId: "run_base",
        role: "baseline",
        meta: null,
        peers: [
          { runId: "run_cand", role: "candidate", status: "queued" },
          { runId: "run_done", role: "candidate", status: "ok" },
        ],
      }),
    ).toBe("run_cand");
  });

  it("without meta refuses ambiguous peers", () => {
    expect(
      resolvePairedCancelSibling({
        runId: "run_x",
        meta: null,
        peers: [
          { runId: "run_a", status: "queued" },
          { runId: "run_b", status: "running" },
        ],
      }),
    ).toBeNull();
  });
});

describe("loadPairedComparison official prompt pin", () => {
  it("INCONCLUSIVE when result evalSkillVersion ≠ snapshot manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-ver-disk-"));
    pairedTemps.push(root);
    const evaluationId = "eval_100_version";
    const baselineRunId = "run_100_basevers";
    const candidateRunId = "run_100_candvers";
    writeJsonFile(path.join(root, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      mode: "official",
      baselineRunId,
      candidateRunId,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    for (const [id, role, score] of [
      [baselineRunId, "baseline", 0.9],
      [candidateRunId, "candidate", 1],
    ] as const) {
      const body =
        role === "baseline" ? "neutral baseline body" : "candidate skill body";
      const base = sample({
        runId: id,
        role,
        evaluationId,
        score,
        mode: "official",
        modelId: "gpt-4.1-mini",
        repeats: 3,
        evalSkillVersion: "forged_version",
      });
      writeJsonFile(path.join(root, id, "result.json"), {
        ...base,
        capture: {
          ...base.capture!,
          skillVersion: "forged_version",
          promptHash: hashPromptInstruction(body),
        },
      });
      const snap = path.join(root, id, "skill-snapshot");
      fs.mkdirSync(path.join(snap, "scripts"), { recursive: true });
      fs.writeFileSync(
        path.join(snap, "scripts", "grade.js"),
        "module.exports = {};\n",
        "utf8",
      );
      fs.writeFileSync(path.join(snap, "SKILL.md"), `${body}\n`, "utf8");
      writeJsonFile(path.join(snap, "manifest.json"), {
        _snapshot: {
          evalSkillVersion: "real_snapshot_sha",
          promptKind: role === "baseline" ? "baseline_neutral" : "skill_md",
        },
      });
    }
    const cmp = loadPairedComparison({ resultsDir: root, evaluationId });
    expect(cmp).not.toBeNull();
    expect(cmp!.parity.ok).toBe(false);
    expect(cmp!.verdict).toBe("INCONCLUSIVE");
    expect(
      cmp!.parity.issues.some((i) =>
        /evalSkillVersion ≠ trusted skill-snapshot/i.test(i),
      ),
    ).toBe(true);
  });

  it("INCONCLUSIVE when skill-snapshot SKILL.md missing on official disk", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-prompt-disk-"));
    pairedTemps.push(root);
    const evaluationId = "eval_100_promptx";
    const baselineRunId = "run_100_baseprom";
    const candidateRunId = "run_100_candprom";
    writeJsonFile(path.join(root, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      mode: "official",
      baselineRunId,
      candidateRunId,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    for (const [id, role, score] of [
      [baselineRunId, "baseline", 0.9],
      [candidateRunId, "candidate", 1],
    ] as const) {
      writeJsonFile(
        path.join(root, id, "result.json"),
        sample({
          runId: id,
          role,
          evaluationId,
          score,
          mode: "official",
          modelId: "gpt-4.1-mini",
          repeats: 3,
        }),
      );
      // grade.js pin only — no SKILL.md ⇒ missing expected prompt hashes.
      const scripts = path.join(root, id, "skill-snapshot", "scripts");
      fs.mkdirSync(scripts, { recursive: true });
      fs.writeFileSync(
        path.join(scripts, "grade.js"),
        "module.exports = {};\n",
        "utf8",
      );
    }
    const cmp = loadPairedComparison({ resultsDir: root, evaluationId });
    expect(cmp).not.toBeNull();
    expect(cmp!.parity.ok).toBe(false);
    expect(cmp!.verdict).toBe("INCONCLUSIVE");
    expect(
      cmp!.parity.issues.some((i) =>
        /trusted expectedBaselinePromptHash|trusted expectedCandidatePromptHash/i.test(
          i,
        ),
      ),
    ).toBe(true);
  });
});

describe("loadPairedComparison tip heal", () => {
  it("follows retry-of to tip candidateRunId (worker Benefit path)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-paired-heal-"));
    pairedTemps.push(root);
    const evaluationId = "eval_100_healxx";
    const baselineRunId = "run_100_baseheal";
    const oldCand = "run_100_oldcheal";
    const tipCand = "run_100_tipcheal";

    writeJsonFile(path.join(root, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      baselineRunId,
      candidateRunId: oldCand,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    writeJsonFile(
      path.join(root, baselineRunId, "result.json"),
      sample({
        runId: baselineRunId,
        role: "baseline",
        evaluationId,
        score: 0.5,
      }),
    );
    writeJsonFile(
      path.join(root, oldCand, "result.json"),
      sample({
        runId: oldCand,
        role: "candidate",
        evaluationId,
        score: 0.7,
        status: "failed",
      }),
    );
    writeJsonFile(
      path.join(root, tipCand, "result.json"),
      sample({
        runId: tipCand,
        role: "candidate",
        evaluationId,
        score: 0.95,
      }),
    );
    writeJsonFile(path.join(root, tipCand, "status.json"), {
      runId: tipCand,
      status: "ok",
      role: "candidate",
      evaluationId,
    });
    writeJsonFile(path.join(root, oldCand, "benefit-report.json"), {
      verdict: { recommendation: "use" },
      stale: true,
    });
    saveRetryMarker(root, oldCand, tipCand);

    const cmp = loadPairedComparison({
      resultsDir: root,
      evaluationId,
    });
    expect(cmp).not.toBeNull();
    expect(cmp!.baselineRunId).toBe(baselineRunId);
    expect(cmp!.candidateRunId).toBe(tipCand);
    expect(cmp!.verdict).toBe("INCONCLUSIVE");
    expect(
      fs.existsSync(path.join(root, oldCand, "benefit-report.json")),
    ).toBe(false);
    const metaAfter = JSON.parse(
      fs.readFileSync(
        path.join(root, evaluationId, "evaluation.json"),
        "utf8",
      ),
    ) as { candidateRunId: string };
    expect(metaAfter.candidateRunId).toBe(tipCand);
  });

  it("keeps explicit leg overrides pinned (no tip walk)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-paired-pin-"));
    pairedTemps.push(root);
    const evaluationId = "eval_100_pinxxx";
    const baselineRunId = "run_100_basepinx";
    const oldCand = "run_100_oldcpinx";
    const tipCand = "run_100_tipcpinx";

    writeJsonFile(path.join(root, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      baselineRunId,
      candidateRunId: oldCand,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    for (const [id, role, score] of [
      [baselineRunId, "baseline", 0.5],
      [oldCand, "candidate", 0.7],
      [tipCand, "candidate", 0.95],
    ] as const) {
      writeJsonFile(
        path.join(root, id, "result.json"),
        sample({
          runId: id,
          role,
          evaluationId,
          score,
        }),
      );
    }
    writeJsonFile(path.join(root, tipCand, "status.json"), {
      runId: tipCand,
      status: "ok",
      role: "candidate",
      evaluationId,
    });
    saveRetryMarker(root, oldCand, tipCand);

    const cmp = loadPairedComparison({
      resultsDir: root,
      evaluationId,
      baselineRunId,
      candidateRunId: oldCand,
    });
    expect(cmp!.candidateRunId).toBe(oldCand);
  });
});
