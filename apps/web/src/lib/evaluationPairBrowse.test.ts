import { describe, expect, it, vi } from "vitest";

import {
  createEvaluationPairBrowseCache,
  evaluationPairBrowseFromPacked,
  pairExportEvidenceFromBrowse,
  pairExportEvidenceFromPacked,
  pairedAdoptionComparisonMode,
  pairedAdoptionModesFromPacked,
  pairedEvalPreferOfficialFromPacked,
  type PackedEvaluationBrowse,
} from "./evaluationPairBrowse.js";
import { officialComparisonExportGate } from "./comparisonExport.js";

vi.mock("@/lib/evaluations", () => ({
  loadEvaluationComparison: vi.fn(() => ({
    meta: { mode: "official", smoke: false },
    baseline: {
      mode: "official",
      capture: { env: { produceAttested: true } },
    },
    candidate: {
      mode: "official",
      capture: { env: { produceAttested: true } },
    },
    comparison: {
      verdict: "INCONCLUSIVE",
      adoptionConfirmation: { step: 1, required: 2 },
    },
  })),
  resolveTipCandidateRunId: () => "run_cand",
  resolveTipBaselineRunId: () => "run_base",
}));

describe("evaluationPairBrowseFromPacked", () => {
  it("includes provisional confirmation from comparison UI", () => {
    const out = evaluationPairBrowseFromPacked({
      meta: { mode: "official", smoke: false },
      baseline: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      candidate: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      comparison: {
        verdict: "INCONCLUSIVE",
        adoptionConfirmation: { step: 1, required: 2 },
      },
    } as PackedEvaluationBrowse);
    expect(out.comparisonProvisional).toEqual({ step: 1, required: 2 });
    expect(out.pairedDisplayMode).toBe("official");
  });

  it("pairedAdoptionModesFromPacked reads tip legs and meta", () => {
    const modes = pairedAdoptionModesFromPacked({
      meta: { mode: "dry-run" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
    } as PackedEvaluationBrowse);
    expect(modes).toEqual({
      metaMode: "dry-run",
      baselineMode: "official",
      candidateMode: "official",
    });
  });

  it("pairExportEvidenceFromBrowse includes tip leg modes for export gates", () => {
    const browse = evaluationPairBrowseFromPacked({
      meta: { mode: "dry-run", smoke: false },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: { verdict: "PASS" },
    } as PackedEvaluationBrowse);
    const evidence = pairExportEvidenceFromBrowse(browse);
    expect(evidence.baselineMode).toBe("official");
    expect(evidence.candidateMode).toBe("official");
    expect(evidence.metaMode).toBe("dry-run");
  });

  it("pairedAdoptionComparisonMode prefers official tip legs over stale comparison.json", () => {
    const packed = {
      meta: { mode: "dry-run" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: { verdict: "PASS", mode: "dry-run" },
    } as PackedEvaluationBrowse;
    expect(
      pairedAdoptionComparisonMode(
        packed.comparison!,
        pairedAdoptionModesFromPacked(packed),
      ),
    ).toBe("official");
    expect(pairedEvalPreferOfficialFromPacked(packed)).toBe(true);
  });

  it("pairExportEvidenceFromPacked feeds official export gate (stale comparison mode)", () => {
    const packed = {
      meta: { mode: "dry-run", smoke: false },
      baseline: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      candidate: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      comparison: { verdict: "PASS", mode: "dry-run" },
    } as PackedEvaluationBrowse;
    expect(
      officialComparisonExportGate(
        packed.comparison!,
        pairExportEvidenceFromPacked(packed),
      ).ok,
    ).toBe(true);
  });
});

describe("createEvaluationPairBrowseCache", () => {
  it("caches comparison meta with provisional 1/N label", async () => {
    const { loadEvaluationComparison } = await import("@/lib/evaluations.js");
    const cache = createEvaluationPairBrowseCache();
    const a = cache.get("eval_a");
    const b = cache.get("eval_a");
    expect(loadEvaluationComparison).toHaveBeenCalledTimes(1);
    expect(a.comparisonMeta?.label).toBe("INCONCLUSIVE · 1/2");
    expect(a.comparisonMeta?.title).toMatch(/second official pair/i);
    expect(b.pairBlocked).toBe(false);
    expect(a.tipCandidateRunId).toBe("run_cand");
  });
});
