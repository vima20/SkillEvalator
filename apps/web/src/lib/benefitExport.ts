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
 * USE additionally requires official Comparison PASS (same bar as run CSV).
 */
export function benefitExportGate(opts: {
  report: {
    verdict: Pick<BenefitReport["verdict"], "recommendation">;
    config: Pick<BenefitReport["config"], "mode">;
  };
  comparison?: Pick<RunComparison, "verdict" | "mode"> | null;
}): BenefitExportGateOk | BenefitExportGateDenied {
  const recommendation = opts.report.verdict.recommendation;
  const mode = opts.report.config.mode;
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
  if (recommendation === "use") {
    if (
      comparison?.mode !== "official" ||
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
    const v = comparison?.verdict;
    if (
      comparison?.mode !== "official" ||
      (v !== "PASS" && v !== "FAIL")
    ) {
      return {
        ok: false,
        status: 409,
        errorCode: "benefit_export_comparison_decisive_required",
        recommendation,
        mode,
        error:
          "benefit export DO NOT USE requires official Comparison PASS or FAIL",
      };
    }
  }
  return { ok: true };
}
