import { describe, expect, it } from "vitest";
import { comparisonCsvGate } from "./comparisonExport.js";

describe("comparisonCsvGate", () => {
  it("allows official PASS and FAIL", () => {
    expect(comparisonCsvGate({ verdict: "PASS", mode: "official" }).ok).toBe(
      true,
    );
    expect(comparisonCsvGate({ verdict: "FAIL", mode: "official" }).ok).toBe(
      true,
    );
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
});
