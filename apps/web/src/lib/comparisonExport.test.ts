import { describe, expect, it } from "vitest";
import {
  COMPARISON_CSV_DOWNLOAD_TITLE,
  comparisonCsvExportHref,
  comparisonCsvGate,
  comparisonEvidenceExportAllowed,
  officialComparisonExportGate,
  pilotArchiveExportHref,
} from "./comparisonExport.js";
import { pilotArchiveGate } from "./pilotArchive.js";

const liveTips = {
  baselineProduceAttested: true,
  candidateProduceAttested: true,
} as const;

describe("comparisonCsvGate", () => {
  it("allows official PASS and FAIL", () => {
    expect(
      comparisonCsvGate({ verdict: "PASS", mode: "official" }, liveTips).ok,
    ).toBe(true);
    expect(
      comparisonCsvGate({ verdict: "FAIL", mode: "official" }, liveTips).ok,
    ).toBe(true);
  });

  it("allows PASS when comparison.json is dry-run but tip legs are official", () => {
    expect(
      comparisonCsvGate(
        { verdict: "PASS", mode: "dry-run" },
        {
          ...liveTips,
          baselineMode: "official",
          candidateMode: "official",
        },
      ).ok,
    ).toBe(true);
  });

  it("blocks dry-run even with PASS", () => {
    const out = comparisonCsvGate({ verdict: "PASS", mode: "dry-run" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(409);
    expect(out.mode).toBe("dry-run");
    expect(out.error).toMatch(/official/i);
  });

  it("blocks INCONCLUSIVE with 409", () => {
    const out = comparisonCsvGate({
      verdict: "INCONCLUSIVE",
      mode: "official",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(409);
    expect(out.verdict).toBe("INCONCLUSIVE");
    expect(out.error).toMatch(/INCONCLUSIVE/);
  });

  it("blocks when adoption confirmation is still provisional 1/N", () => {
    const out = officialComparisonExportGate({
      verdict: "INCONCLUSIVE",
      mode: "official",
      adoptionConfirmation: { step: 1, required: 2 },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.verdict).toBe("INCONCLUSIVE");
    expect(out.errorCode).toBe("comparison_export_provisional_pass");
    expect(out.error).toMatch(/provisional official PASS 1\/2/i);
  });

  it("blocks stale raw PASS when confirmation is still pending", () => {
    const out = officialComparisonExportGate({
      verdict: "PASS",
      mode: "official",
      adoptionConfirmation: { step: 1, required: 2 },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.verdict).toBe("INCONCLUSIVE");
    expect(out.errorCode).toBe("comparison_export_provisional_pass");
  });

  it("explains provisional official PASS 1/N on export block", () => {
    const out = officialComparisonExportGate({
      verdict: "INCONCLUSIVE",
      mode: "official",
      adoptionConfirmation: { step: 1, required: 2 },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/provisional official PASS 1\/2/i);
    expect(out.error).toMatch(/second independent official pair/i);
  });

  it("blocks smoke and FAKE_PRODUCE like pilot archive", () => {
    const smoke = comparisonCsvGate(
      { verdict: "PASS", mode: "official" },
      { metaSmoke: true },
    );
    expect(smoke.ok).toBe(false);
    if (!smoke.ok) {
      expect(smoke.errorCode).toBe("comparison_export_smoke_forbidden");
    }
    const fake = comparisonCsvGate(
      { verdict: "FAIL", mode: "official" },
      { candidateFakeProduce: true },
    );
    expect(fake.ok).toBe(false);
    if (!fake.ok) {
      expect(fake.errorCode).toBe("comparison_export_fake_produce_forbidden");
    }

    const comparison = { verdict: "PASS" as const, mode: "official" as const };
    expect(
      pilotArchiveGate({ comparison, metaSmoke: true }).ok,
    ).toBe(false);
    expect(
      officialComparisonExportGate(comparison, { metaSmoke: true }).ok,
    ).toBe(false);
    expect(
      officialComparisonExportGate(comparison, liveTips).ok,
    ).toBe(true);
    expect(officialComparisonExportGate(comparison).ok).toBe(false);
  });
});

describe("comparison evidence download helpers", () => {
  it("builds stable hrefs and filenames", () => {
    expect(comparisonCsvExportHref("eval_1")).toBe(
      "/api/comparison/eval_1/csv",
    );
    expect(pilotArchiveExportHref("eval_1")).toBe(
      "/api/comparison/eval_1/archive",
    );
    expect(COMPARISON_CSV_DOWNLOAD_TITLE).toContain("candidateGoldenQuality");
  });

  it("comparisonEvidenceExportAllowed mirrors comparisonCsvGate", () => {
    const comparison = { verdict: "PASS" as const, mode: "official" as const };
    expect(
      comparisonEvidenceExportAllowed("eval_x", comparison, liveTips),
    ).toBe(true);
    expect(comparisonEvidenceExportAllowed(null, comparison, liveTips)).toBe(
      false,
    );
    expect(
      comparisonEvidenceExportAllowed(
        "eval_x",
        { verdict: "INCONCLUSIVE", mode: "official" },
        liveTips,
      ),
    ).toBe(false);
  });
});
