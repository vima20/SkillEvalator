import {
  comparisonAdoptionVerdict,
  type ComparisonVerdict,
  type RunComparison,
  type RunResult,
} from "@skillevalator/core";
import { isAdoptionConfirmationPending } from "@/lib/comparisonVerdictDisplay";
import { pairedEvaluationAdoptionMode } from "@/lib/pairedAdoptionMode";

export type OfficialComparisonEvidence = {
  metaSmoke?: boolean;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  /** Live worker pin — required true on both tip legs for export. */
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
  metaMode?: string | null;
  baselineMode?: RunResult["mode"];
  candidateMode?: RunResult["mode"];
};

export type OfficialComparisonExportDeny = {
  ok: false;
  status: 409;
  error: string;
  errorCode: string;
  verdict: ComparisonVerdict;
  mode: RunComparison["mode"];
};

/**
 * Shared bar for Comparison CSV + pilot archive + detail download buttons.
 * Official PASS/FAIL only; never dry-run, evaluation.smoke, FAKE_PRODUCE, or
 * unattested tip legs (produceAttested must be true on both).
 */
export function officialComparisonExportGate(
  comparison: Pick<
    RunComparison,
    "verdict" | "mode" | "adoptionConfirmation"
  >,
  evidence: OfficialComparisonEvidence = {},
  product: "comparison CSV export" | "pilot archive download" =
    "comparison CSV export",
): { ok: true } | OfficialComparisonExportDeny {
  const { mode } = comparison;
  const adoptionMode =
    pairedEvaluationAdoptionMode({
      comparisonMode: mode,
      metaMode: evidence.metaMode,
      baselineMode: evidence.baselineMode,
      candidateMode: evidence.candidateMode,
    }) ?? mode;
  const adoptionVerdict = comparisonAdoptionVerdict(comparison, adoptionMode);

  if (adoptionMode !== "official") {
    return {
      ok: false,
      status: 409,
      verdict: adoptionVerdict,
      mode: adoptionMode,
      errorCode: "comparison_export_not_official",
      error: `${product} requires mode=official (dry-run is not adoption evidence)`,
    };
  }
  if (adoptionVerdict !== "PASS" && adoptionVerdict !== "FAIL") {
    const confirm = comparison.adoptionConfirmation;
    const provisional = isAdoptionConfirmationPending(confirm)
      ? `provisional official PASS ${confirm!.step}/${confirm!.required}`
      : null;
    return {
      ok: false,
      status: 409,
      verdict: adoptionVerdict,
      mode,
      errorCode: provisional
        ? "comparison_export_provisional_pass"
        : "comparison_export_inconclusive",
      error: provisional
        ? `${product} locked — ${provisional}; confirm with a second independent official pair before export`
        : `${product} requires PASS or FAIL verdict (not INCONCLUSIVE)`,
    };
  }
  if (evidence.metaSmoke === true) {
    return {
      ok: false,
      status: 409,
      verdict: adoptionVerdict,
      mode,
      errorCode: "comparison_export_smoke_forbidden",
      error: `${product} rejects evaluation.smoke=true (fixture plant)`,
    };
  }
  if (evidence.baselineFakeProduce || evidence.candidateFakeProduce) {
    return {
      ok: false,
      status: 409,
      verdict: adoptionVerdict,
      mode,
      errorCode: "comparison_export_fake_produce_forbidden",
      error: `${product} rejects FAKE_PRODUCE tip legs (not live evidence)`,
    };
  }
  if (
    evidence.baselineProduceAttested !== true ||
    evidence.candidateProduceAttested !== true
  ) {
    return {
      ok: false,
      status: 409,
      verdict: adoptionVerdict,
      mode,
      errorCode: "comparison_export_not_attested",
      error: `${product} requires produceAttested=true on both tip legs`,
    };
  }
  return { ok: true };
}

/**
 * Adoption CSV must not look like an official export when Comparison is
 * INCONCLUSIVE, dry-run, smoke plant, or FAKE_PRODUCE.
 * Always pass the full Comparison object — bare verdict strings omit mode
 * and would allow dry-run PASS/FAIL CSV laundering.
 */
export function comparisonCsvGate(
  comparison: Pick<
    RunComparison,
    "verdict" | "mode" | "adoptionConfirmation"
  >,
  evidence: OfficialComparisonEvidence = {},
): { ok: true } | OfficialComparisonExportDeny {
  return officialComparisonExportGate(
    comparison,
    evidence,
    "comparison CSV export",
  );
}

/** UI tooltips for Comparison evidence downloads (CSV + pilot archive). */
export const COMPARISON_CSV_DOWNLOAD_TITLE =
  "Per-task deltas; candidateDiffRatio and candidateGoldenQuality columns match Benefit CSV golden rules";

export const PILOT_ARCHIVE_DOWNLOAD_TITLE =
  "Zip tip legs, evaluation, comparison.json, MANIFEST (tip mode, git SHA, candidateTasksGoldenPassed/Total)";

export function comparisonCsvExportHref(evaluationId: string): string {
  return `/api/comparison/${encodeURIComponent(evaluationId)}/csv`;
}

export function pilotArchiveExportHref(evaluationId: string): string {
  return `/api/comparison/${encodeURIComponent(evaluationId)}/archive`;
}

export function comparisonCsvDownloadFilename(evaluationId: string): string {
  return `${evaluationId}-comparison.csv`;
}

export function pilotArchiveDownloadFilename(evaluationId: string): string {
  return `${evaluationId}-pilot-archive.zip`;
}

export function comparisonEvidenceExportAllowed(
  evaluationId: string | null | undefined,
  comparison: Pick<
    RunComparison,
    "verdict" | "mode" | "adoptionConfirmation"
  > | null | undefined,
  evidence: OfficialComparisonEvidence = {},
): boolean {
  return (
    Boolean(evaluationId && comparison) &&
    comparisonCsvGate(comparison!, evidence).ok
  );
}
