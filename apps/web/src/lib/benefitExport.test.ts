import { describe, expect, it } from "vitest";
import { benefitExportGate } from "./benefitExport.js";

describe("benefitExportGate", () => {
  it("allows official use and do_not_use", () => {
    expect(
      benefitExportGate({
        verdict: { recommendation: "use" } as never,
        config: { mode: "official" } as never,
      }).ok,
    ).toBe(true);
    expect(
      benefitExportGate({
        verdict: { recommendation: "do_not_use" } as never,
        config: { mode: "official" } as never,
      }).ok,
    ).toBe(true);
  });

  it("allows bare recommendation for back-compat when mode omitted", () => {
    expect(benefitExportGate("use").ok).toBe(true);
    expect(benefitExportGate("do_not_use").ok).toBe(true);
  });

  it("blocks dry-run even with do_not_use", () => {
    const out = benefitExportGate({
      verdict: {
        recommendation: "do_not_use",
        headline: "x",
        decision: "x",
        rationale: "x",
      },
      config: { mode: "dry-run" } as never,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(409);
    expect(out.mode).toBe("dry-run");
    expect(out.error).toMatch(/official/i);
  });

  it("blocks inconclusive with 409", () => {
    const out = benefitExportGate({
      verdict: {
        recommendation: "inconclusive",
        headline: "x",
        decision: "x",
        rationale: "x",
      },
      config: { mode: "official" } as never,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(409);
    expect(out.recommendation).toBe("inconclusive");
    expect(out.error).toMatch(/inconclusive/);
  });
});
