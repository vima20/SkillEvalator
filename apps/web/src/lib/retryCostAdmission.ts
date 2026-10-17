import fs from "node:fs";
import path from "node:path";
import {
  JobManifestSchema,
  readJsonFile,
  type EnqueueCostCapDenied,
  type EnqueueCostCapOk,
  type JobManifest,
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

/** First parseable terminal job — same order as POST /retry loadFailedJob. */
export function loadFirstTerminalJobManifest(
  runId: string,
): JobManifest | null {
  const candidates = [
    path.join(jobsDir(), `${runId}.failed.json`),
    path.join(jobsDir(), `${runId}.done.json`),
    path.join(jobsDir(), `${runId}.cancelled.json`),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      return JobManifestSchema.parse(readJsonFile(p));
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Resolve skill/mode/repeats for retry cost + official gates.
 * Same job → result (+ status.repeats) merge as POST /retry enqueue fields.
 */
export function resolveRetryCostParams(opts: {
  runId: string;
  result?: {
    evalSkillId?: string;
    mode?: string;
    repeats?: number;
  } | null;
  status?: { repeats?: number } | null;
  /** Injected terminal job (skip disk). */
  job?: JobManifest | null;
}): RetryCostParams | null {
  const job =
    opts.job !== undefined
      ? opts.job
      : loadFirstTerminalJobManifest(opts.runId);
  const evalSkillId = job?.evalSkillId ?? opts.result?.evalSkillId;
  const modeRaw = job?.mode ?? opts.result?.mode;
  const mode =
    modeRaw === "dry-run" || modeRaw === "official" ? modeRaw : undefined;
  const repeats = job?.repeats ?? opts.result?.repeats ?? opts.status?.repeats;
  if (
    !evalSkillId ||
    !mode ||
    typeof repeats !== "number" ||
    !Number.isFinite(repeats)
  ) {
    return null;
  }
  return { evalSkillId, mode, repeats };
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
