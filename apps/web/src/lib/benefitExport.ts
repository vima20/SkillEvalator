import type {
  BenefitReport,
  ComparisonVerdict,
  RunComparison,
  RunResult,
  SkillUseVerdict,
} from "@skillevalator/core";
import { comparisonAdoptionVerdict } from "@skillevalator/core/comparisonAdoptionVerdict";
import { pairedEvaluationAdoptionMode } from "@/lib/pairedAdoptionMode";
import { isAdoptionConfirmationPending } from "@/lib/comparisonVerdictDisplay";

export type BenefitExportGateOk = { ok: true };

export type BenefitExportGateDenied = {
  ok: false;
  status: 409;
  error: string;
  errorCode: string;
  recommendation: SkillUseVerdict;
  mode?: BenefitReport["config"]["mode"];
};

/**
 * Adoption Benefit exports require official mode + decisive recommendation.
 * USE additionally requires official Comparison PASS on this candidate runId
 * (same tip-leg bar as Benefit UI — superseded retries cannot export USE).
 */
export function benefitExportGate(opts: {
  report: {
    verdict: Pick<BenefitReport["verdict"], "recommendation">;
    config: Pick<BenefitReport["config"], "mode" | "runId">;
  };
  comparison?: Pick<
    RunComparison,
    | "verdict"
    | "mode"
    | "candidateRunId"
    | "baselineRunId"
    | "adoptionConfirmation"
  > | null;
  /** Same evidence bar as Comparison CSV / pilot archive. */
  metaSmoke?: boolean;
  /** Tip / self capture (legacy); prefer sibling flags when packed. */
  fakeProduce?: boolean;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
  metaMode?: string | null;
  baselineMode?: RunResult["mode"];
  candidateMode?: RunResult["mode"];
}): BenefitExportGateOk | BenefitExportGateDenied {
  const recommendation = opts.report.verdict.recommendation;
  const mode = opts.report.config.mode;
  const runId = opts.report.config.runId;
  const comparison = opts.comparison;
  const comparisonAdoptionMode =
    comparison &&
    pairedEvaluationAdoptionMode({
      comparisonMode: comparison.mode,
      metaMode: opts.metaMode,
      baselineMode: opts.baselineMode,
      candidateMode: opts.candidateMode,
    });
  const comparisonAdoptionVerdictValue =
    comparison &&
    comparisonAdoptionVerdict(
      comparison,
      comparisonAdoptionMode ?? comparison.mode,
    );

  if (opts.metaSmoke === true) {
    return {
      ok: false,
      status: 409,
      errorCode: "benefit_export_smoke_forbidden",
      recommendation,
      mode,
      error:
        "benefit export rejects evaluation.smoke=true (fixture plant)",
    };
  }
  if (
    opts.fakeProduce === true ||
    opts.baselineFakeProduce === true ||
    opts.candidateFakeProduce === true
  ) {
    return {
      ok: false,
      status: 409,
      errorCode: "benefit_export_fake_produce_forbidden",
      recommendation,
      mode,
      error:
        "benefit export rejects FAKE_PRODUCE tip legs (not live evidence)",
    };
  }

  if (mode !== "official") {
    return {
      ok: false,
      status: 409,
      errorCode: "benefit_export_official_required",
      recommendation,
      mode,
      error:
        "benefit export requires mode=official (dry-run is not adoption evidence)",
    };
  }
  if (recommendation === "inconclusive") {
    return {
      ok: false,
      status: 409,
      errorCode: "benefit_export_not_decisive",
      recommendation,
      mode,
      error:
        "benefit export requires use or do_not_use recommendation (not inconclusive)",
    };
  }
  // Adoption exports are tip-candidate only (not superseded retries / baseline).
  if (
    !comparison?.candidateRunId ||
    !runId ||
    runId !== comparison.candidateRunId
  ) {
    return {
      ok: false,
      status: 409,
      errorCode: "benefit_export_not_tip_candidate",
      recommendation,
      mode,
      error:
        "benefit export requires this runId to be the Comparison candidateRunId (tip leg)",
    };
  }
  if (recommendation === "use") {
    const confirm = comparison?.adoptionConfirmation;
    if (
      comparisonAdoptionMode !== "official" ||
      comparisonAdoptionVerdictValue !== ("PASS" satisfies ComparisonVerdict)
    ) {
      const provisional =
        isAdoptionConfirmationPending(confirm) && confirm
          ? `benefit export USE locked — provisional official PASS ${confirm.step}/${confirm.required}; confirm with a second independent official pair`
          : "benefit export USE requires official Comparison PASS";
      return {
        ok: false,
        status: 409,
        errorCode: isAdoptionConfirmationPending(confirm)
          ? "benefit_export_provisional_pass"
          : "benefit_export_comparison_pass_required",
        recommendation,
        mode,
        error: provisional,
      };
    }
  }
  if (recommendation === "do_not_use") {
    if (
      comparisonAdoptionMode !== "official" ||
      comparisonAdoptionVerdictValue !== ("FAIL" satisfies ComparisonVerdict)
    ) {
      return {
        ok: false,
        status: 409,
        errorCode: "benefit_export_comparison_fail_required",
        recommendation,
        mode,
        error:
          "benefit export DO NOT USE requires official Comparison FAIL",
      };
    }
  }
  if (
    opts.baselineProduceAttested !== true ||
    opts.candidateProduceAttested !== true
  ) {
    return {
      ok: false,
      status: 409,
      errorCode: "benefit_export_not_attested",
      recommendation,
      mode,
      error:
        "benefit export requires produceAttested=true on both tip legs",
    };
  }
  return { ok: true };
}
