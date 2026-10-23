import type {
  AdoptionConfirmation,
  RunComparison,
  RunResult,
} from "@skillevalator/core";

import {
  benefitPairEvidenceFromPacked,
  type BenefitListPairChip,
} from "@/lib/benefitListHints";
import { comparisonUiFromPacked } from "@/lib/dashboardComparisonMeta";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { pairedEvaluationAdoptionMode } from "@/lib/pairedAdoptionMode";
import {
  pairedEvalDisplayMode,
  pairedEvalPreferOfficial,
} from "@/lib/pilotFocusHref";

export type PackedEvaluationBrowse = ReturnType<
  typeof loadEvaluationComparison
>;

export type EvaluationPairEvidence = ReturnType<
  typeof benefitPairEvidenceFromPacked
>["pairEvidence"];

export type PairedAdoptionModes = {
  metaMode?: string;
  baselineMode?: RunResult["mode"];
  candidateMode?: RunResult["mode"];
};

/** Subset of a loaded evaluation pack — modes only (list meta, Benefit, export). */
export type PackedAdoptionModeSource = {
  meta?: { mode?: string } | null;
  baseline?: { mode?: string } | null;
  candidate?: { mode?: string } | null;
};

/** Tip leg + meta modes for adoption gates (Benefit USE, export, list chips). */
export function pairedAdoptionModesFromPacked(
  packed: PackedAdoptionModeSource,
): PairedAdoptionModes {
  return {
    ...(packed.meta?.mode ? { metaMode: packed.meta.mode } : {}),
    ...(packed.baseline?.mode === "official" ||
    packed.baseline?.mode === "dry-run"
      ? { baselineMode: packed.baseline.mode }
      : {}),
    ...(packed.candidate?.mode === "official" ||
    packed.candidate?.mode === "dry-run"
      ? { candidateMode: packed.candidate.mode }
      : {}),
  };
}

export function pairedEvalDisplayModeFromPacked(
  packed: PackedAdoptionModeSource,
): string | undefined {
  return pairedEvalDisplayMode(pairedAdoptionModesFromPacked(packed));
}

export function pairedEvalPreferOfficialFromPacked(
  packed: PackedAdoptionModeSource,
): boolean {
  return pairedEvalPreferOfficial(pairedAdoptionModesFromPacked(packed));
}

/** List/detail chip mode — tip legs only (not stale comparison.json). */
export function resolvePairedDisplayModeFromPacked(
  packed: PackedAdoptionModeSource & { comparison?: unknown | null },
): string | undefined {
  if (!packed.comparison) return undefined;
  return pairedEvalDisplayModeFromPacked(packed);
}

/** Benefit / list rows — browse chip with tip-leg fallback. */
export function resolvedPairedDisplayModeFromBrowse(
  entry: EvaluationPairBrowseEntry | null | undefined,
): string | undefined {
  if (!entry) return undefined;
  return (
    entry.pairedDisplayMode ??
    resolvePairedDisplayModeFromPacked(entry.packed)
  );
}

/** Runs / Dashboard / Benefit rows — tip legs beat stale result.json mode. */
export function listRowAdoptionMode(
  pairBrowse: EvaluationPairBrowseEntry | null | undefined,
  resultMode?: string | null,
): string {
  return (
    resolvedPairedDisplayModeFromBrowse(pairBrowse) ??
    resultMode ??
    "—"
  );
}

/** Exported CSV metadata — same resolution as export gates. */
export function pairedAdoptionComparisonMode(
  comparison: Pick<RunComparison, "mode">,
  modes: PairedAdoptionModes,
): RunComparison["mode"] {
  return (
    pairedEvaluationAdoptionMode({
      comparisonMode: comparison.mode,
      ...modes,
    }) ?? comparison.mode
  );
}

/** Comparison / run CSV export gates — tip modes beat stale comparison.json. */
export function pairExportEvidenceFromBrowse(
  entry: EvaluationPairBrowseEntry,
): EvaluationPairEvidence & PairedAdoptionModes {
  return {
    ...entry.pairEvidence,
    ...pairedAdoptionModesFromPacked(entry.packed),
  };
}

/** APIs: one browse pass for export gates (tip modes beat stale comparison.json). */
export function pairExportEvidenceFromPacked(
  packed: PackedEvaluationBrowse,
  browse?: EvaluationPairBrowseEntry,
): ReturnType<typeof pairExportEvidenceFromBrowse> {
  return pairExportEvidenceFromBrowse(
    browse ?? evaluationPairBrowseFromPacked(packed),
  );
}

/** Comparison export when pairBrowse is already computed (SSR list/detail). */
export function comparisonExportContextFromBrowse(
  packed: PackedEvaluationBrowse,
  pairBrowse: EvaluationPairBrowseEntry,
): {
  pairBrowse: EvaluationPairBrowseEntry;
  evidence: ReturnType<typeof pairExportEvidenceFromBrowse>;
  adoptionMode: RunComparison["mode"];
  comparisonJsonMode?: RunComparison["mode"];
} {
  const adoption = pilotArchiveAdoptionFromPacked(packed);
  return {
    pairBrowse,
    evidence: pairExportEvidenceFromBrowse(pairBrowse),
    adoptionMode: adoption.adoptionMode,
    ...(adoption.comparisonJsonMode
      ? { comparisonJsonMode: adoption.comparisonJsonMode }
      : {}),
  };
}

/** Comparison CSV / pilot archive — single browse for gate evidence + adoption mode. */
export function comparisonExportContextFromPacked(
  packed: PackedEvaluationBrowse,
): ReturnType<typeof comparisonExportContextFromBrowse> {
  const pairBrowse = evaluationPairBrowseFromPacked(packed);
  return comparisonExportContextFromBrowse(packed, pairBrowse);
}

/** Benefit export when pairBrowse is already computed (SSR detail). */
export function benefitExportContextFromBrowse(
  packed: PackedEvaluationBrowse,
  pairBrowse: EvaluationPairBrowseEntry,
): {
  pairBrowse: EvaluationPairBrowseEntry;
  evidence: ReturnType<typeof pairExportEvidenceFromBrowse>;
  comparisonMode?: RunComparison["mode"];
} {
  const evidence = pairExportEvidenceFromBrowse(pairBrowse);
  const comparison = packed.comparison;
  return {
    pairBrowse,
    evidence,
    ...(comparison
      ? {
          comparisonMode: pairedAdoptionComparisonMode(comparison, evidence),
        }
      : {}),
  };
}

/** Benefit export API / detail — single browse for gate evidence + CSV comparisonMode. */
export function benefitExportContextFromPacked(
  packed: PackedEvaluationBrowse,
  browse?: EvaluationPairBrowseEntry,
): ReturnType<typeof benefitExportContextFromBrowse> {
  const pairBrowse = browse ?? evaluationPairBrowseFromPacked(packed);
  return benefitExportContextFromBrowse(packed, pairBrowse);
}

/** Archive zip: resolved adoption mode + optional stale comparison.json mode. */
export function pilotArchiveAdoptionFromPacked(
  packed: PackedEvaluationBrowse,
): {
  adoptionMode: RunComparison["mode"];
  comparisonJsonMode?: RunComparison["mode"];
} {
  const comparison = packed.comparison!;
  const adoptionMode = pairedAdoptionComparisonMode(
    comparison,
    pairedAdoptionModesFromPacked(packed),
  );
  return adoptionMode === comparison.mode
    ? { adoptionMode }
    : { adoptionMode, comparisonJsonMode: comparison.mode };
}

export type EvaluationPairBrowseEntry = {
  packed: PackedEvaluationBrowse;
  tipCandidateRunId: string | null;
  tipBaselineRunId: string | null;
  pairEvidence: EvaluationPairEvidence;
  pairChip: BenefitListPairChip | null;
  pairBlocked: boolean;
  comparisonMeta: ReturnType<
    typeof comparisonUiFromPacked
  >["comparisonMeta"];
  pairedDisplayMode?: string;
  comparisonProvisional?: AdoptionConfirmation;
};

/** Pair evidence + Comparison list meta from an already-loaded evaluation pack. */
export function evaluationPairBrowseFromPacked(
  packed: PackedEvaluationBrowse,
): EvaluationPairBrowseEntry {
  const tipCandidateRunId = resolveTipCandidateRunId(packed);
  const tipBaselineRunId = resolveTipBaselineRunId(packed);
  const { pairChip, pairBlocked, pairEvidence } = benefitPairEvidenceFromPacked({
    tipBaselineRunId,
    tipCandidateRunId,
    metaSmoke: packed.meta?.smoke === true,
    baseline: packed.baseline,
    candidate: packed.candidate,
  });
  const { comparisonMeta, comparisonProvisional } =
    comparisonUiFromPacked(packed);
  const pairedDisplayMode = resolvePairedDisplayModeFromPacked(packed);
  return {
    packed,
    tipCandidateRunId,
    tipBaselineRunId,
    pairEvidence,
    pairChip,
    pairBlocked,
    comparisonMeta,
    ...(pairedDisplayMode ? { pairedDisplayMode } : {}),
    ...(comparisonProvisional ? { comparisonProvisional } : {}),
  };
}

/** One disk read per evaluationId — shared by Dashboard / Runs list rows. */
export function createEvaluationPairBrowseCache(): {
  get(evaluationId: string): EvaluationPairBrowseEntry;
} {
  const map = new Map<string, EvaluationPairBrowseEntry>();
  return {
    get(evaluationId: string) {
      let entry = map.get(evaluationId);
      if (!entry) {
        entry = evaluationPairBrowseFromPacked(
          loadEvaluationComparison(evaluationId),
        );
        map.set(evaluationId, entry);
      }
      return entry;
    },
  };
}
