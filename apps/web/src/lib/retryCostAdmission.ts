import fs from "node:fs";
import path from "node:path";
import {
  JobManifestSchema,
  readJsonFile,
  type EnqueueCostCapDenied,
  type EnqueueCostCapOk,
} from "@skillevalator/core";
import { checkEnqueueCostCap } from "@/lib/enqueueCostGate";
import { jobsDir } from "@/lib/paths";
import { formatRetryCostBlockedReason } from "@/lib/retryCostAdmissionCopy";

export type RetryCostAdmission = {
  blocked: boolean;
  reason: string | null;
  estimatedUsd?: number;
  costCapUsd?: number;
  errorCode?: "enqueue_cost_over_cap";
};

export type RetryCostParams = {
  evalSkillId: string;
  mode: "dry-run" | "official";
  repeats: number;
};

export { formatRetryCostBlockedReason } from "@/lib/retryCostAdmissionCopy";

export function retryCostAdmissionFromGate(
  gate: EnqueueCostCapOk | EnqueueCostCapDenied,
): RetryCostAdmission {
  if (gate.ok) return { blocked: false, reason: null };
  return {
    blocked: true,
    reason: formatRetryCostBlockedReason(gate.costCapUsd),
    estimatedUsd: gate.estimatedUsd,
    costCapUsd: gate.costCapUsd,
    errorCode: gate.errorCode,
  };
}

/**
 * Server-side retry cost admission (mirrors POST /retry checkEnqueueCostCap).
 * Missing skill → not blocked (enqueue / skillReady own the 4xx).
 */
export function retryCostAdmission(opts: {
  evalSkillId: string;
  mode: "dry-run" | "official";
  repeats: number;
  costCapUsd: number;
}): RetryCostAdmission {
  return retryCostAdmissionFromGate(checkEnqueueCostCap(opts));
}

function loadJobRetryParams(runId: string): RetryCostParams | null {
  const candidates = [
    path.join(jobsDir(), `${runId}.failed.json`),
    path.join(jobsDir(), `${runId}.done.json`),
    path.join(jobsDir(), `${runId}.cancelled.json`),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const job = JobManifestSchema.parse(readJsonFile(p));
      if (
        (job.mode === "dry-run" || job.mode === "official") &&
        typeof job.repeats === "number" &&
        Number.isFinite(job.repeats) &&
        job.evalSkillId
      ) {
        return {
          evalSkillId: job.evalSkillId,
          mode: job.mode,
          repeats: job.repeats,
        };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Resolve skill/mode/repeats for retry cost gate (result → status → job). */
export function resolveRetryCostParams(opts: {
  runId: string;
  result?: {
    evalSkillId?: string;
    mode?: string;
    repeats?: number;
  } | null;
  status?: { repeats?: number } | null;
}): RetryCostParams | null {
  const fromResult =
    opts.result?.evalSkillId &&
    (opts.result.mode === "dry-run" || opts.result.mode === "official")
      ? {
          evalSkillId: opts.result.evalSkillId,
          mode: opts.result.mode as "dry-run" | "official",
          repeats: opts.result.repeats ?? opts.status?.repeats,
        }
      : null;
  if (
    fromResult &&
    typeof fromResult.repeats === "number" &&
    Number.isFinite(fromResult.repeats)
  ) {
    return {
      evalSkillId: fromResult.evalSkillId,
      mode: fromResult.mode,
      repeats: fromResult.repeats,
    };
  }
  return loadJobRetryParams(opts.runId);
}

/** Admission for GET run detail / SSR — unknown params → not blocked. */
export function retryCostAdmissionForRun(opts: {
  runId: string;
  costCapUsd: number;
  result?: {
    evalSkillId?: string;
    mode?: string;
    repeats?: number;
  } | null;
  status?: { repeats?: number } | null;
}): RetryCostAdmission {
  const params = resolveRetryCostParams(opts);
  if (!params) return { blocked: false, reason: null };
  return retryCostAdmission({
    ...params,
    costCapUsd: opts.costCapUsd,
  });
}
