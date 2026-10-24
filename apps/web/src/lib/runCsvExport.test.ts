import { describe, expect, it } from "vitest";
import {
  comparisonExportContextFromBrowse,
  evaluationPairBrowseFromPacked,
  type PackedEvaluationBrowse,
} from "./evaluationPairBrowse.js";
import { runCsvExportGate, runCsvExportGateFromPacked } from "./runCsvExport.js";

const base = {
  runId: "run_cand",
  mode: "official" as const,
  evaluationId: "eval_1",
  status: "ok" as const,
  capture: { env: { fakeProduce: false, produceAttested: true } },
};

const tipLegs = {
  baselineRunId: "run_base",
  candidateRunId: "run_cand",
  baselineProduceAttested: true,
  candidateProduceAttested: true,
};

describe("runCsvExportGate", () => {
  it("allows export when comparison.json mode is stale dry-run but tip legs are official", () => {
    expect(
      runCsvExportGate({
        result: base,
        comparisonVerdict: "PASS",
        comparisonMode: "dry-run",
        baselineMode: "official",
        candidateMode: "official",
        ...tipLegs,
      }).ok,
    ).toBe(true);
  });

  it("allows official paired PASS/FAIL on meta legs", () => {
    expect(
      runCsvExportGate({
        result: base,
        comparisonVerdict: "PASS",
        comparisonMode: "official",
        ...tipLegs,
      }).ok,
    ).toBe(true);
    expect(
      runCsvExportGate({
        result: { ...base, runId: "run_base" },
        comparisonVerdict: "FAIL",
        comparisonMode: "official",
        ...tipLegs,
      }).ok,
    ).toBe(true);
  });

  it("blocks FAKE_PRODUCE (self or sibling) and evaluation.smoke", () => {
    const fake = runCsvExportGate({
      result: {
        ...base,
        capture: { env: { fakeProduce: true } },
      },
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      ...tipLegs,
    });
    expect(fake.ok).toBe(false);
    if (!fake.ok) expect(fake.errorCode).toBe("run_csv_smoke_forbidden");

    const sibling = runCsvExportGate({
      result: base,
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      ...tipLegs,
      baselineFakeProduce: true,
    });
    expect(sibling.ok).toBe(false);
    if (!sibling.ok) expect(sibling.errorCode).toBe("run_csv_smoke_forbidden");

    const meta = runCsvExportGate({
      result: base,
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      ...tipLegs,
      metaSmoke: true,
    });
    expect(meta.ok).toBe(false);
    if (!meta.ok) expect(meta.errorCode).toBe("run_csv_eval_smoke_forbidden");
  });

  it("blocks PASS when adoption confirmation is still provisional 1/N", () => {
    const out = runCsvExportGate({
      result: base,
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      comparisonAdoptionConfirmation: { step: 1, required: 2 },
      ...tipLegs,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("run_csv_provisional_pass");
    expect(out.error).toMatch(/provisional official PASS 1\/2/i);
  });

  it("blocks dry-run", () => {
    const out = runCsvExportGate({
      result: { ...base, mode: "dry-run" },
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      ...tipLegs,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("run_csv_official_required");
  });

  it("blocks missing evaluationId or non-decisive Comparison", () => {
    const noPair = runCsvExportGate({
      result: { ...base, evaluationId: undefined },
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      ...tipLegs,
    });
    expect(noPair.ok).toBe(false);
    if (!noPair.ok) expect(noPair.errorCode).toBe("run_csv_pair_required");

    const waiting = runCsvExportGate({
      result: base,
      comparisonVerdict: null,
      comparisonMode: "official",
      ...tipLegs,
    });
    expect(waiting.ok).toBe(false);
    if (!waiting.ok)
      expect(waiting.errorCode).toBe("run_csv_comparison_not_decisive");
  });

  it("accepts resolved evaluationId when result omits it", () => {
    expect(
      runCsvExportGate({
        result: { ...base, evaluationId: undefined },
        evaluationId: "eval_from_status",
        comparisonVerdict: "PASS",
        comparisonMode: "official",
        ...tipLegs,
      }).ok,
    ).toBe(true);
  });

  it("blocks when comparisonMode is missing", () => {
    const out = runCsvExportGate({
      result: base,
      comparisonVerdict: "PASS",
      comparisonMode: null,
      ...tipLegs,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errorCode).toBe("run_csv_comparison_not_official");
  });

  it("blocks superseded runId not on current meta", () => {
    const out = runCsvExportGate({
      result: { ...base, runId: "run_old_cand" },
      comparisonVerdict: "PASS",
      comparisonMode: "official",
      ...tipLegs,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errorCode).toBe("run_csv_not_meta_leg");
  });
});

describe("runCsvExportGateFromPacked", () => {
  it("allows export when packed comparison.json is stale dry-run", () => {
    const packed = {
      meta: {
        mode: "dry-run",
        baselineRunId: "run_base",
        candidateRunId: "run_cand",
      },
      comparison: { verdict: "PASS", mode: "dry-run" },
      baseline: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      candidate: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
    } as PackedEvaluationBrowse;
    const pairBrowse = evaluationPairBrowseFromPacked(packed);
    const exportCtx = comparisonExportContextFromBrowse(packed, pairBrowse);
    expect(exportCtx.adoptionMode).toBe("official");
    expect(
      runCsvExportGateFromPacked({
        result: base as import("@skillevalator/core").RunResult,
        evaluationId: "eval_stale",
        packed,
        pairBrowse,
      }).ok,
    ).toBe(true);
  });

  it("409 carries tip adoption metadata when export is blocked", () => {
    const packed = {
      meta: {
        mode: "dry-run",
        baselineRunId: "run_base",
        candidateRunId: "run_cand",
      },
      comparison: { verdict: "INCONCLUSIVE", mode: "dry-run" },
      baseline: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      candidate: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
    } as PackedEvaluationBrowse;
    const pairBrowse = evaluationPairBrowseFromPacked(packed);
    const out = runCsvExportGateFromPacked({
      result: {
        ...base,
        runId: "run_cand",
        evaluationId: "eval_stale",
      } as import("@skillevalator/core").RunResult,
      evaluationId: "eval_stale",
      packed,
      pairBrowse,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("run_csv_comparison_not_decisive");
    expect(out.adoptionMode).toBe("official");
    expect(out.comparisonJsonMode).toBe("dry-run");
    expect(out.resultMode).toBe("official");
  });
});
