import { describe, expect, it } from "vitest";
import { benefitExportGate } from "./benefitExport.js";

const officialReport = (rec: "use" | "do_not_use" | "inconclusive") =>
  ({
    verdict: {
      recommendation: rec,
      headline: "x",
      decision: "x",
      rationale: "x",
    },
    config: { mode: "official" as const },
  }) as const;

describe("benefitExportGate", () => {
  it("allows USE with official Comparison PASS", () => {
    expect(
      benefitExportGate({
        report: officialReport("use"),
        comparison: { verdict: "PASS", mode: "official" },
      }).ok,
    ).toBe(true);
  });

  it("blocks USE without Comparison PASS", () => {
    const out = benefitExportGate({
      report: officialReport("use"),
      comparison: null,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_comparison_pass_required");
  });

  it("allows DO NOT USE with official Comparison FAIL", () => {
    expect(
      benefitExportGate({
        report: officialReport("do_not_use"),
        comparison: { verdict: "FAIL", mode: "official" },
      }).ok,
    ).toBe(true);
  });

  it("blocks dry-run", () => {
    const out = benefitExportGate({
      report: {
        verdict: officialReport("do_not_use").verdict,
        config: { mode: "dry-run" },
      } as never,
      comparison: { verdict: "FAIL", mode: "dry-run" },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_official_required");
  });

  it("blocks inconclusive", () => {
    const out = benefitExportGate({
      report: officialReport("inconclusive"),
      comparison: { verdict: "PASS", mode: "official" },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_not_decisive");
  });
});
