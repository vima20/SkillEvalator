import type { ComparisonVerdict, RunComparison } from "@skillevalator/core";
import { isAdoptionConfirmationPending } from "@/lib/comparisonVerdictDisplay";

export type OfficialComparisonEvidence = {
  metaSmoke?: boolean;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  /** Live worker pin — required true on both tip legs for export. */
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
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
  const { verdict, mode } = comparison;

  if (mode !== "official") {
    return {
      ok: false,
      status: 409,
      verdict,
      mode,
      errorCode: "comparison_export_not_official",
      error: `${product} requires mode=official (dry-run is not adoption evidence)`,
    };
  }
  if (verdict !== "PASS" && verdict !== "FAIL") {
    const confirm = comparison.adoptionConfirmation;
    const provisional = isAdoptionConfirmationPending(confirm)
      ? `provisional official PASS ${confirm!.step}/${confirm!.required}`
      : null;
    return {
      ok: false,
      status: 409,
      verdict,
      mode,
      errorCode: "comparison_export_inconclusive",
      error: provisional
        ? `${product} locked — ${provisional}; confirm with a second independent official pair before export`
        : `${product} requires PASS or FAIL verdict (not INCONCLUSIVE)`,
    };
  }
  if (evidence.metaSmoke === true) {
    return {
      ok: false,
      status: 409,
      verdict,
      mode,
      errorCode: "comparison_export_smoke_forbidden",
      error: `${product} rejects evaluation.smoke=true (fixture plant)`,
    };
  }
  if (evidence.baselineFakeProduce || evidence.candidateFakeProduce) {
    return {
      ok: false,
      status: 409,
      verdict,
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
      verdict,
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
  comparison: Pick<RunComparison, "verdict" | "mode">,
  evidence: OfficialComparisonEvidence = {},
): { ok: true } | OfficialComparisonExportDeny {
  return officialComparisonExportGate(
    comparison,
    evidence,
    "comparison CSV export",
  );
}

/** Detail-page visibility for CSV + pilot archive buttons (same bar as APIs). */
export function canShowOfficialComparisonDownloads(
  opts: {
    comparison: Pick<RunComparison, "verdict" | "mode">;
  } & OfficialComparisonEvidence,
): boolean {
  return officialComparisonExportGate(opts.comparison, {
    metaSmoke: opts.metaSmoke,
    baselineFakeProduce: opts.baselineFakeProduce,
    candidateFakeProduce: opts.candidateFakeProduce,
    baselineProduceAttested: opts.baselineProduceAttested,
    candidateProduceAttested: opts.candidateProduceAttested,
  }).ok;
}
