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

const liveTips = {
  baselineProduceAttested: true,
  candidateProduceAttested: true,
} as const;

describe("benefitExportGate", () => {
  it("allows USE with official Comparison PASS on tip candidate", () => {
    expect(
      benefitExportGate({
        report: officialReport("use"),
        comparison: tipComparison("PASS"),
        ...liveTips,
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
      ...liveTips,
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
      ...liveTips,
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
        ...liveTips,
      }).ok,
    ).toBe(true);
  });

  it("blocks DO NOT USE when Comparison is PASS", () => {
    const out = benefitExportGate({
      report: officialReport("do_not_use"),
      comparison: tipComparison("PASS"),
      ...liveTips,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_comparison_fail_required");
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
      ...liveTips,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("benefit_export_not_decisive");
  });

  it("blocks evaluation.smoke and FAKE_PRODUCE", () => {
    const smoke = benefitExportGate({
      report: officialReport("use"),
      comparison: tipComparison("PASS"),
      metaSmoke: true,
      ...liveTips,
    });
    expect(smoke.ok).toBe(false);
    if (!smoke.ok) expect(smoke.errorCode).toBe("benefit_export_smoke_forbidden");

    const fake = benefitExportGate({
      report: officialReport("use"),
      comparison: tipComparison("PASS"),
      fakeProduce: true,
      ...liveTips,
    });
    expect(fake.ok).toBe(false);
    if (!fake.ok)
      expect(fake.errorCode).toBe("benefit_export_fake_produce_forbidden");
  });

  it("blocks baseline or candidate FAKE_PRODUCE sibling", () => {
    const base = benefitExportGate({
      report: officialReport("use"),
      comparison: tipComparison("PASS"),
      baselineFakeProduce: true,
      ...liveTips,
    });
    expect(base.ok).toBe(false);
    if (!base.ok)
      expect(base.errorCode).toBe("benefit_export_fake_produce_forbidden");

    const cand = benefitExportGate({
      report: officialReport("use"),
      comparison: tipComparison("PASS"),
      candidateFakeProduce: true,
      ...liveTips,
    });
    expect(cand.ok).toBe(false);
    if (!cand.ok)
      expect(cand.errorCode).toBe("benefit_export_fake_produce_forbidden");
  });

  it("blocks missing produceAttested on tip legs", () => {
    const out = benefitExportGate({
      report: officialReport("use"),
      comparison: tipComparison("PASS"),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errorCode).toBe("benefit_export_not_attested");
  });
});
