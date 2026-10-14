import { describe, expect, it } from "vitest";
import { comparisonCsvGate } from "./comparisonExport.js";

describe("comparisonCsvGate", () => {
  it("allows PASS and FAIL", () => {
    expect(comparisonCsvGate("PASS").ok).toBe(true);
    expect(comparisonCsvGate("FAIL").ok).toBe(true);
  });

  it("blocks INCONCLUSIVE with 409", () => {
    const out = comparisonCsvGate("INCONCLUSIVE");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(409);
    expect(out.verdict).toBe("INCONCLUSIVE");
    expect(out.error).toMatch(/INCONCLUSIVE/);
  });
});
