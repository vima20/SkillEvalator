import { describe, expect, it } from "vitest";
import { runCsvExportGate } from "./runCsvExport.js";

const base = {
  runId: "run_cand",
  mode: "official" as const,
  evaluationId: "eval_1",
  status: "ok" as const,
  capture: { env: { fakeProduce: false } },
};

const tipLegs = {
  baselineRunId: "run_base",
  candidateRunId: "run_cand",
};

describe("runCsvExportGate", () => {
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

  it("blocks FAKE_PRODUCE and evaluation.smoke", () => {
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
