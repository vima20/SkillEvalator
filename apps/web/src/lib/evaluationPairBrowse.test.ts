import { describe, expect, it, vi } from "vitest";

import {
  benefitExportContextFromBrowse,
  benefitExportContextFromPacked,
  comparisonExportContextFromBrowse,
  comparisonExportContextFromPacked,
  createEvaluationPairBrowseCache,
  evaluationPairBrowseFromPacked,
  pairExportEvidenceFromBrowse,
  pairExportEvidenceFromPacked,
  pairedAdoptionComparisonMode,
  pairedAdoptionModesFromPacked,
  pilotArchiveAdoptionFromPacked,
  adoptionModeDesyncTitle,
  listRowAdoptionMode,
  pairedEvalPreferOfficialFromPacked,
  resolvedPairedDisplayModeFromBrowse,
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

  it("pairedDisplayMode ignores stale comparison.json dry-run when tip legs are official", () => {
    const out = evaluationPairBrowseFromPacked({
      meta: { mode: "dry-run", smoke: false },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: { verdict: "PASS", mode: "dry-run" },
    } as PackedEvaluationBrowse);
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

  it("resolvedPairedDisplayModeFromBrowse resolves from packed when browse omits field", () => {
    const packed = {
      meta: { mode: "dry-run", smoke: false },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: { verdict: "PASS", mode: "dry-run" },
    } as PackedEvaluationBrowse;
    expect(
      resolvedPairedDisplayModeFromBrowse({
        packed,
        tipCandidateRunId: "c",
        tipBaselineRunId: "b",
        pairEvidence: {
          metaSmoke: false,
          baselineFakeProduce: false,
          candidateFakeProduce: false,
          baselineProduceAttested: true,
          candidateProduceAttested: true,
        },
        pairChip: null,
        pairBlocked: false,
        comparisonMeta: null,
      }),
    ).toBe("official");
  });

  it("resolvedPairedDisplayModeFromBrowse uses tip legs when comparison.json is absent", () => {
    const packed = {
      meta: { mode: "dry-run", baselineRunId: "b", candidateRunId: "c" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
    } as PackedEvaluationBrowse;
    expect(
      resolvedPairedDisplayModeFromBrowse(
        evaluationPairBrowseFromPacked(packed),
      ),
    ).toBe("official");
  });

  it("pilotArchiveAdoptionFromPacked records comparisonJsonMode when disk mode is stale", () => {
    const packed = {
      meta: { mode: "dry-run" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: { verdict: "PASS", mode: "dry-run" },
    } as PackedEvaluationBrowse;
    expect(pilotArchiveAdoptionFromPacked(packed)).toEqual({
      adoptionMode: "official",
      comparisonJsonMode: "dry-run",
    });
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

  it("benefitExportContextFromPacked shares one browse for gate and CSV comparisonMode", () => {
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
    const browse = evaluationPairBrowseFromPacked(packed);
    const ctx = benefitExportContextFromPacked(packed);
    expect(ctx.comparisonMode).toBe("official");
    expect(ctx.comparisonJsonMode).toBe("dry-run");
    expect(ctx.evidence).toEqual(pairExportEvidenceFromBrowse(browse));
    expect(benefitExportContextFromBrowse(packed, browse)).toEqual(ctx);
  });

  it("listRowAdoptionMode prefers tip legs over stale result.json", () => {
    const packed = {
      meta: { mode: "dry-run", smoke: false },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
      comparison: { verdict: "PASS", mode: "dry-run" },
    } as PackedEvaluationBrowse;
    const browse = evaluationPairBrowseFromPacked(packed);
    expect(listRowAdoptionMode(browse, "dry-run")).toBe("official");
    expect(listRowAdoptionMode(null, "dry-run")).toBe("dry-run");
    const pendingPacked = {
      meta: { mode: "dry-run", baselineRunId: "b", candidateRunId: "c" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
    } as PackedEvaluationBrowse;
    expect(
      listRowAdoptionMode(
        evaluationPairBrowseFromPacked(pendingPacked),
        "dry-run",
      ),
    ).toBe("official");
    expect(adoptionModeDesyncTitle("official", "dry-run")).toMatch(
      /tip pair adoption mode is official/,
    );
    expect(adoptionModeDesyncTitle("official", "official")).toBeUndefined();
    expect(adoptionModeDesyncTitle("—", "dry-run")).toBeUndefined();
  });

  it("comparisonExportContextFromPacked shares one browse for gate and adoption mode", () => {
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
    const browse = evaluationPairBrowseFromPacked(packed);
    const ctx = comparisonExportContextFromPacked(packed);
    expect(ctx.pairBrowse).toEqual(browse);
    expect(ctx.adoptionMode).toBe("official");
    expect(ctx.comparisonJsonMode).toBe("dry-run");
    expect(ctx.evidence).toEqual(pairExportEvidenceFromBrowse(browse));
    expect(comparisonExportContextFromBrowse(packed, browse)).toEqual(ctx);
    expect(
      officialComparisonExportGate(packed.comparison!, ctx.evidence).ok,
    ).toBe(true);
    expect(pairExportEvidenceFromPacked(packed, browse)).toEqual(ctx.evidence);
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
