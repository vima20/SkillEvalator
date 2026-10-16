import {
  enqueueCostCapGate,
  loadSkill,
  MODEL_DRY_RUN,
  MODEL_OFFICIAL,
  taskIdsForMode,
  type EnqueueCostCapDenied,
  type EnqueueCostCapOk,
} from "@skillevalator/core";
import { skillsDirs } from "@/lib/paths";

/**
 * Per-leg cost admission for POST /api/runs and retry.
 * If the skill cannot load, return ok so skillReady / enqueue own the 4xx.
 */
export function checkEnqueueCostCap(opts: {
  evalSkillId: string;
  mode: "dry-run" | "official";
  repeats: number;
  costCapUsd: number;
}): EnqueueCostCapOk | EnqueueCostCapDenied {
  try {
    const skill = loadSkill(skillsDirs(), opts.evalSkillId);
    const taskCount = taskIdsForMode(skill, opts.mode).length;
    const modelId =
      opts.mode === "official" ? MODEL_OFFICIAL : MODEL_DRY_RUN;
    return enqueueCostCapGate({
      taskCount,
      repeats: opts.repeats,
      modelId,
      costCapUsd: opts.costCapUsd,
    });
  } catch {
    return { ok: true };
  }
}
