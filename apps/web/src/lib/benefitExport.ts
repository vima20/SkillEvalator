import type { BenefitReport, SkillUseVerdict } from "@skillevalator/core";

/**
 * Adoption Benefit exports require official mode + decisive recommendation.
 * Dry-run do_not_use must not look like pilot rejection evidence.
 */
export function benefitExportGate(
  report: Pick<BenefitReport, "verdict" | "config"> | SkillUseVerdict,
):
  | { ok: true }
  | {
      ok: false;
      status: 409;
      error: string;
      recommendation: SkillUseVerdict;
      mode?: BenefitReport["config"]["mode"];
    } {
  const recommendation =
    typeof report === "string" ? report : report.verdict.recommendation;
  const mode = typeof report === "string" ? undefined : report.config.mode;

  if (mode !== undefined && mode !== "official") {
    return {
      ok: false,
      status: 409,
      recommendation,
      mode,
      error:
        "benefit export requires mode=official (dry-run is not adoption evidence)",
    };
  }
  if (recommendation === "use" || recommendation === "do_not_use") {
    return { ok: true };
  }
  return {
    ok: false,
    status: 409,
    recommendation,
    ...(mode ? { mode } : {}),
    error:
      "benefit export requires use or do_not_use recommendation (not inconclusive)",
  };
}
