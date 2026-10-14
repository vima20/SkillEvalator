import type {
  BenefitReport,
  ComparisonVerdict,
  RunComparison,
  SkillUseVerdict,
} from "@skillevalator/core";

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
    "verdict" | "mode" | "candidateRunId" | "baselineRunId"
  > | null;
}): BenefitExportGateOk | BenefitExportGateDenied {
  const recommendation = opts.report.verdict.recommendation;
  const mode = opts.report.config.mode;
  const runId = opts.report.config.runId;
  const comparison = opts.comparison;

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
    if (
      comparison.mode !== "official" ||
      comparison.verdict !== ("PASS" satisfies ComparisonVerdict)
    ) {
      return {
        ok: false,
        status: 409,
        errorCode: "benefit_export_comparison_pass_required",
        recommendation,
        mode,
        error:
          "benefit export USE requires official Comparison PASS",
      };
    }
  }
  if (recommendation === "do_not_use") {
    if (
      comparison.mode !== "official" ||
      comparison.verdict !== ("FAIL" satisfies ComparisonVerdict)
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
  return { ok: true };
}
