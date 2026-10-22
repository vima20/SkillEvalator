/**
 * CI smoke: official Comparison PASS/FAIL must unlock the same export gates
 * the API uses (Benefit / run CSV / Comparison CSV). No OpenAI.
 */
import { describe, expect, it } from "vitest";
import {
  OFFICIAL_MIN_REPEATS,
  buildBenefitReport,
  compareBaselineCandidate,
  jobAttestationFromRunResult,
  type RunResult,
} from "@skillevalator/core";
import { benefitExportGate } from "./benefitExport.js";
import {
  comparisonCsvGate,
  officialComparisonExportGate,
} from "./comparisonExport.js";
import { pilotArchiveGate } from "./pilotArchive.js";
import { pilotArchiveAdoptionFromPacked } from "./evaluationPairBrowse.js";
import { runCsvExportGate } from "./runCsvExport.js";

/** Fixture trusted pins (export smoke has no skill-snapshot on disk). */
const GRADE_HASH = "gradehash_smoke_export_aaaaaaaaaaaaaaaaaaaa";
const officialCompareOpts = {
  expectedEvalSkillId: "code-debugging-eval",
  expectedEvaluationMode: "official" as const,
  expectedGradeHash: GRADE_HASH,
  expectedBaselinePromptHash: "basehash_export",
  expectedCandidatePromptHash: "candhash_export",
  expectedBaselineEvalSkillVersion: "abc",
  expectedCandidateEvalSkillVersion: "abc",
  expectedBaselinePromptKind: "baseline_neutral" as const,
  expectedCandidatePromptKind: "skill_md" as const,
  expectedTaskSetId: "cde-v1",
  expectedTaskIds: ["bug-01"],
};

function officialLeg(
  opts: Pick<RunResult, "runId" | "role" | "score"> & {
    evaluationId: string;
  },
): RunResult {
  const promptKind =
    opts.role === "baseline" ? "baseline_neutral" : "skill_md";
  return {
    runId: opts.runId,
    evalSkillId: "code-debugging-eval",
    evalSkillVersion: "abc",
    evalSkillGithubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    evaluationId: opts.evaluationId,
    taskSetId: "cde-v1",
    taskIds: ["bug-01"],
    pipeline: { produce: "model", grade: "docker_script" },
    modelId: "gpt-4.1-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: OFFICIAL_MIN_REPEATS,
    scoreSpread: 0,
    aggregate: "mean",
    perTask: [
      {
        taskId: "bug-01",
        scriptResults: [],
        score: opts.score,
        status: "ok",
      },
    ],
    score: opts.score,
    subscores: {},
    rationale: "",
    findings: [],
    costUsd: 0.01,
    latencyMs: 1000,
    status: "ok",
    startedAt: "2026-10-14T00:00:00.000Z",
    finishedAt: "2026-10-14T00:01:00.000Z",
    mode: "official",
    role: opts.role,
    capture: {
      githubUrl:
        "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
      commit: "deadbeef",
      license: "MIT",
      dependencies: [],
      skillVersion: "abc",
      role: opts.role as "baseline" | "candidate",
      promptHash: opts.role === "baseline" ? "basehash_export" : "candhash_export",
      promptKind,
      env: {
        fakeProduce: false,
        produceAttested: true,
        costCapUsd: 5,
        costHardStop: true,
        allowHostGrade: false,
        gradeHash: GRADE_HASH,
        temperature: 0,
        topP: 1,
        seed: 42,
        maxOutputTokens: 1024,
        modelDryRun: "gpt-4o-mini",
        modelOfficial: "gpt-4.1-mini",
        grade: "docker_script",
      },
    },
    tokens: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
  };
}

describe("official export gates smoke", () => {
  it("PASS unlocks Benefit USE + run CSV + Comparison CSV", () => {
    const evaluationId = "eval_smoke_export_pass";
    const baseline = officialLeg({
      runId: "run_base_export_pass",
      role: "baseline",
      score: 0.5,
      evaluationId,
    });
    const candidate = officialLeg({
      runId: "run_cand_export_pass",
      role: "candidate",
      score: 1,
      evaluationId,
    });
    const comparison = compareBaselineCandidate(baseline, candidate, {
      ...officialCompareOpts,
      expectedEvaluationId: evaluationId,
      expectedBaselineJob: jobAttestationFromRunResult(baseline)!,
      expectedCandidateJob: jobAttestationFromRunResult(candidate)!,
    });
    expect(comparison.parity.ok).toBe(true);
    expect(comparison.verdict).toBe("PASS");

    const report = buildBenefitReport(candidate, { comparison });
    expect(report.verdict.recommendation).toBe("use");
    const liveTips = {
      baselineProduceAttested: true,
      candidateProduceAttested: true,
    };
    expect(
      benefitExportGate({
        report,
        comparison,
        metaSmoke: false,
        fakeProduce: false,
        ...liveTips,
      }).ok,
    ).toBe(true);
    expect(
      runCsvExportGate({
        result: candidate,
        comparisonVerdict: comparison.verdict,
        comparisonMode: comparison.mode,
        baselineRunId: comparison.baselineRunId,
        candidateRunId: comparison.candidateRunId,
        metaSmoke: false,
        ...liveTips,
      }).ok,
    ).toBe(true);
    expect(comparisonCsvGate(comparison, liveTips).ok).toBe(true);
    expect(
      pilotArchiveGate({
        comparison,
        metaSmoke: false,
        baselineFakeProduce: false,
        candidateFakeProduce: false,
        ...liveTips,
      }).ok,
    ).toBe(true);
  });

  it("FAIL unlocks DO NOT USE Benefit + run/Comparison CSV; blocks USE", () => {
    const evaluationId = "eval_smoke_export_fail";
    const baseline = officialLeg({
      runId: "run_base_export_fail",
      role: "baseline",
      score: 0.8,
      evaluationId,
    });
    const candidate = officialLeg({
      runId: "run_cand_export_fail",
      role: "candidate",
      score: 0.9,
      evaluationId,
    });
    const comparison = compareBaselineCandidate(baseline, candidate, {
      ...officialCompareOpts,
      expectedEvaluationId: evaluationId,
      expectedBaselineJob: jobAttestationFromRunResult(baseline)!,
      expectedCandidateJob: jobAttestationFromRunResult(candidate)!,
    });
    expect(comparison.verdict).toBe("FAIL");

    const report = buildBenefitReport(candidate, { comparison });
    expect(report.verdict.recommendation).toBe("do_not_use");
    const liveTips = {
      baselineProduceAttested: true,
      candidateProduceAttested: true,
    };
    expect(
      benefitExportGate({
        report,
        comparison,
        metaSmoke: false,
        fakeProduce: false,
        ...liveTips,
      }).ok,
    ).toBe(true);
    expect(
      benefitExportGate({
        report: {
          ...report,
          verdict: { ...report.verdict, recommendation: "use" },
        },
        comparison,
        ...liveTips,
      }).ok,
    ).toBe(false);
    expect(
      runCsvExportGate({
        result: candidate,
        comparisonVerdict: comparison.verdict,
        comparisonMode: comparison.mode,
        baselineRunId: comparison.baselineRunId,
        candidateRunId: comparison.candidateRunId,
        metaSmoke: false,
        ...liveTips,
      }).ok,
    ).toBe(true);
    expect(comparisonCsvGate(comparison, liveTips).ok).toBe(true);
    expect(
      pilotArchiveGate({
        comparison,
        metaSmoke: false,
        baselineFakeProduce: false,
        candidateFakeProduce: false,
        ...liveTips,
      }).ok,
    ).toBe(true);
    expect(
      pilotArchiveGate({
        comparison,
        metaSmoke: true,
      }).ok,
    ).toBe(false);
    expect(
      comparisonCsvGate(comparison, { metaSmoke: true }).ok,
    ).toBe(false);
    expect(
      comparisonCsvGate(comparison, { candidateFakeProduce: true }).ok,
    ).toBe(false);
    expect(
      benefitExportGate({
        report,
        comparison,
        metaSmoke: true,
      }).ok,
    ).toBe(false);
    expect(
      runCsvExportGate({
        result: candidate,
        comparisonVerdict: comparison.verdict,
        comparisonMode: comparison.mode,
        baselineRunId: comparison.baselineRunId,
        candidateRunId: comparison.candidateRunId,
        metaSmoke: true,
      }).ok,
    ).toBe(false);
  });

  it("provisional official PASS 1/2 denies adoption exports", () => {
    const liveTips = {
      baselineProduceAttested: true,
      candidateProduceAttested: true,
    };
    const provisionalInconclusive = {
      verdict: "INCONCLUSIVE" as const,
      mode: "official" as const,
      adoptionConfirmation: { step: 1, required: 2 },
      baselineRunId: "run_b_prov",
      candidateRunId: "run_c_prov",
    };
    const inconclusiveCmp = officialComparisonExportGate(
      provisionalInconclusive,
      liveTips,
    );
    expect(inconclusiveCmp.ok).toBe(false);
    if (!inconclusiveCmp.ok) {
      expect(inconclusiveCmp.error).toMatch(/provisional official PASS 1\/2/i);
    }

    const passUnconfirmed = {
      verdict: "PASS" as const,
      mode: "official" as const,
      adoptionConfirmation: { step: 1, required: 2 },
      baselineRunId: "run_b_prov",
      candidateRunId: "run_c_prov",
    };
    const cmpPass = comparisonCsvGate(passUnconfirmed, liveTips);
    expect(cmpPass.ok).toBe(false);
    if (!cmpPass.ok) {
      expect(cmpPass.errorCode).toBe("comparison_export_provisional_pass");
    }
    expect(
      pilotArchiveGate({ comparison: passUnconfirmed, ...liveTips }).ok,
    ).toBe(false);
    const runCsv = runCsvExportGate({
      result: {
        runId: "run_c_prov",
        mode: "official",
        evaluationId: "eval_prov",
        status: "ok",
        capture: { env: { fakeProduce: false, produceAttested: true } },
      },
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      comparisonAdoptionConfirmation: { step: 1, required: 2 },
      baselineRunId: "run_b_prov",
      candidateRunId: "run_c_prov",
      ...liveTips,
    });
    expect(runCsv.ok).toBe(false);
    if (!runCsv.ok) {
      expect(runCsv.errorCode).toBe("run_csv_provisional_pass");
    }
    expect(
      benefitExportGate({
        report: {
          verdict: { recommendation: "use" },
          config: { mode: "official", runId: "run_c_prov" },
        },
        comparison: passUnconfirmed,
        ...liveTips,
      }).ok,
    ).toBe(false);
  });

  it("export gates allow PASS when comparison.json mode is stale dry-run but tip legs are official", () => {
    const liveTips = {
      baselineProduceAttested: true,
      candidateProduceAttested: true,
      baselineMode: "official" as const,
      candidateMode: "official" as const,
    };
    const staleComparison = {
      verdict: "PASS" as const,
      mode: "dry-run" as const,
      baselineRunId: "run_b_stale",
      candidateRunId: "run_c_stale",
    };
    expect(comparisonCsvGate(staleComparison, liveTips).ok).toBe(true);
    expect(
      runCsvExportGate({
        result: {
          runId: "run_c_stale",
          mode: "official",
          evaluationId: "eval_stale_mode",
          status: "ok",
          capture: { env: { fakeProduce: false, produceAttested: true } },
        },
        comparisonVerdict: "PASS",
        comparisonMode: "dry-run",
        baselineRunId: "run_b_stale",
        candidateRunId: "run_c_stale",
        ...liveTips,
      }).ok,
    ).toBe(true);
    expect(
      pilotArchiveGate({ comparison: staleComparison, ...liveTips }).ok,
    ).toBe(true);
    expect(
      benefitExportGate({
        report: {
          verdict: { recommendation: "use" },
          config: { mode: "official", runId: "run_c_stale" },
        },
        comparison: staleComparison,
        ...liveTips,
      }).ok,
    ).toBe(true);
    expect(
      pilotArchiveAdoptionFromPacked({
        meta: { mode: "dry-run" },
        baseline: { mode: "official" },
        candidate: { mode: "official" },
        comparison: staleComparison,
      } as never),
    ).toEqual({
      adoptionMode: "official",
      comparisonJsonMode: "dry-run",
    });
  });

  it("dry-run Comparison is denied by all adoption export gates", () => {
    const evaluationId = "eval_smoke_export_dry";
    const baseline = {
      ...officialLeg({
        runId: "run_base_export_dry",
        role: "baseline",
        score: 0.5,
        evaluationId,
      }),
      mode: "dry-run" as const,
      modelId: "gpt-4o-mini",
      repeats: 1,
    };
    const candidate = {
      ...officialLeg({
        runId: "run_cand_export_dry",
        role: "candidate",
        score: 1,
        evaluationId,
      }),
      mode: "dry-run" as const,
      modelId: "gpt-4o-mini",
      repeats: 1,
    };
    const comparison = compareBaselineCandidate(baseline, candidate);
    expect(comparison.verdict).toBe("INCONCLUSIVE");
    expect(comparisonCsvGate(comparison).ok).toBe(false);
    expect(pilotArchiveGate({ comparison }).ok).toBe(false);

    const report = buildBenefitReport(candidate, { comparison });
    expect(report.verdict.recommendation).toBe("inconclusive");
    expect(benefitExportGate({ report, comparison }).ok).toBe(false);
    expect(
      runCsvExportGate({
        result: candidate,
        comparisonVerdict: comparison.verdict,
        comparisonMode: comparison.mode,
        baselineRunId: comparison.baselineRunId,
        candidateRunId: comparison.candidateRunId,
      }).ok,
    ).toBe(false);
  });
});
