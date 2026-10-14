import { describe, expect, it } from "vitest";
import { benefitExportGate } from "./benefitExport.js";

const tipCand = "run_tip";
const officialReport = (rec: "use" | "do_not_use" | "inconclusive") =>
  ({
    verdict: {
      recommendation: rec,
      headline: "x",
      decision: "x",
      rationale: "x",
    },
    config: { mode: "official" as const, runId: tipCand },
  }) as const;

const tipComparison = (
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE",
  mode: "official" | "dry-run" = "official",
) =>
  ({
    verdict,
    mode,
    candidateRunId: tipCand,
    baselineRunId: "run_base",
  }) as const;

describe("benefitExportGate", () => {
  it("allows USE with official Comparison PASS on tip candidate", () => {
    expect(
      benefitExportGate({
        report: officialReport("use"),
        comparison: tipComparison("PASS"),
      }).ok,
    ).toBe(true);
  });

  it("blocks USE without Comparison / tip candidate", () => {
    const out = benefitExportGate({
      report: officialReport("use"),
      comparison: null,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_not_tip_candidate");
  });

  it("blocks USE when tip matches but Comparison is not PASS", () => {
    const out = benefitExportGate({
      report: officialReport("use"),
      comparison: tipComparison("FAIL"),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_comparison_pass_required");
  });

  it("blocks USE on superseded candidate runId", () => {
    const out = benefitExportGate({
      report: {
        ...officialReport("use"),
        config: { mode: "official", runId: "run_old" },
      },
      comparison: tipComparison("PASS"),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_not_tip_candidate");
  });

  it("allows DO NOT USE with official Comparison FAIL", () => {
    expect(
      benefitExportGate({
        report: officialReport("do_not_use"),
        comparison: tipComparison("FAIL"),
      }).ok,
    ).toBe(true);
  });

  it("blocks dry-run", () => {
    const out = benefitExportGate({
      report: {
        verdict: officialReport("do_not_use").verdict,
        config: { mode: "dry-run", runId: tipCand },
      } as never,
      comparison: tipComparison("FAIL", "dry-run"),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_official_required");
  });

  it("blocks inconclusive", () => {
    const out = benefitExportGate({
      report: officialReport("inconclusive"),
      comparison: tipComparison("PASS"),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_not_decisive");
  });
});
