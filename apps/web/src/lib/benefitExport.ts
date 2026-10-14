import type { SkillUseVerdict } from "@skillevalator/core";

/**
 * Adoption Benefit exports must not look decisive when the verdict is
 * inconclusive (smoke / dry-run / baseline / cancelled / missing role).
 */
export function benefitExportGate(
  recommendation: SkillUseVerdict,
):
  | { ok: true }
  | {
      ok: false;
      status: 409;
      error: string;
      recommendation: SkillUseVerdict;
    } {
  if (recommendation === "use" || recommendation === "do_not_use") {
    return { ok: true };
  }
  return {
    ok: false,
    status: 409,
    recommendation,
    error:
      "benefit export requires use or do_not_use recommendation (not inconclusive)",
  };
}
