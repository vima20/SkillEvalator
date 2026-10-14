import { describe, expect, it } from "vitest";
import { benefitExportGate } from "./benefitExport.js";

describe("benefitExportGate", () => {
  it("allows use and do_not_use", () => {
    expect(benefitExportGate("use").ok).toBe(true);
    expect(benefitExportGate("do_not_use").ok).toBe(true);
  });

  it("blocks inconclusive with 409", () => {
    const out = benefitExportGate("inconclusive");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(409);
    expect(out.recommendation).toBe("inconclusive");
    expect(out.error).toMatch(/inconclusive/);
  });
});
