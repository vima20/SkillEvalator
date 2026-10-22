import { describe, expect, it } from "vitest";

import {
  comparisonCellMetaFromPacked,
  comparisonUiFromPacked,
} from "./dashboardComparisonMeta.js";

describe("comparisonCellMetaFromPacked", () => {
  it("labels provisional official PASS 1/N", () => {
    const out = comparisonCellMetaFromPacked({
      meta: { mode: "official" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: {
        verdict: "INCONCLUSIVE",
        adoptionConfirmation: { step: 1, required: 2 },
      },
    });
    expect(out?.label).toBe("INCONCLUSIVE · 1/2");
    expect(out?.title).toMatch(/second official pair/i);
  });

  it("labels confirmed official PASS", () => {
    const out = comparisonCellMetaFromPacked({
      meta: { mode: "official" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: {
        verdict: "PASS",
        adoptionConfirmation: { step: 2, required: 2 },
      },
    });
    expect(out?.label).toBe("PASS");
    expect(out?.title).toBeUndefined();
  });

  it("returns null when comparison missing", () => {
    expect(comparisonCellMetaFromPacked({ comparison: null })).toBeNull();
  });
});

describe("comparisonUiFromPacked", () => {
  it("bundles meta and provisional step for official 1/N", () => {
    const out = comparisonUiFromPacked({
      meta: { mode: "official" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: {
        verdict: "INCONCLUSIVE",
        adoptionConfirmation: { step: 1, required: 2 },
      },
    });
    expect(out.comparisonMeta?.label).toBe("INCONCLUSIVE · 1/2");
    expect(out.comparisonProvisional).toEqual({ step: 1, required: 2 });
    expect(out.pairedDisplayMode).toBe("official");
  });
});
