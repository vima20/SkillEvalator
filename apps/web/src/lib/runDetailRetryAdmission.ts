import fs from "node:fs";
import path from "node:path";
import {
  JobManifestSchema,
  evaluationIdFromSources,
  hasLiveJobFile,
  isNonRetryableErrorCode,
  officialEnqueueAllowed,
  readJsonFile,
  staleOrphanRunningRunIds,
} from "@skillevalator/core";
import { isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { collectPilotBlockers } from "@/lib/pilotReady";
import { retryGate } from "@/lib/runLifecycle";
import { runPreflight, type RunPreflightResult } from "@/lib/runPreflight";
import {
  resolveRetryCostParams,
  retryCostAdmissionForRun,
  type RetryCostAdmission,
} from "@/lib/retryCostAdmission";
import { resolveWebAuthConfig } from "@/lib/webAuth";

export type RunDetailRetryAdmission = {
  canRetry: boolean;
  blockedReason: string | null;
};

const RETRYABLE = new Set(["failed", "cancelled", "budget_stop"]);

/**
 * Pure admission mirroring POST /api/runs/[runId]/retry order.
 * Injected deps keep vitest free of Docker/fs.
 */
export function computeRunDetailRetryAdmission(opts: {
  status?: string;
  errorCode?: string;
  hasLiveJob: boolean;
  /** Wind-down: status budget_stop, no result yet. */
  budgetStopping?: boolean;
  mode?: string | null;
  evaluationId?: string | null;
  preflightOk: boolean;
  /** Same list as Settings Ready (official only). */
  pilotBlockers: string[];
  costAdmission: RetryCostAdmission;
  env?: Record<string, string | undefined>;
  webAuthKind: "open" | "required" | "misconfigured";
  requireWebAuthConfigured: boolean;
}): RunDetailRetryAdmission {
  const status = opts.status ?? "unknown";
  if (!RETRYABLE.has(status)) {
    return { canRetry: false, blockedReason: null };
  }
  if (opts.budgetStopping) {
    return {
      canRetry: false,
      blockedReason:
        "run still finishing — wait for result.json (or cancel) before retry",
    };
  }
  if (opts.errorCode === "insufficient_quota") {
    return {
      canRetry: false,
      blockedReason:
        "Retry blocked: no OpenAI credits. Add billing credits first.",
    };
  }
  const gate = retryGate({
    status,
    hasLiveJob: opts.hasLiveJob,
    nonRetryableError: isNonRetryableErrorCode(opts.errorCode),
  });
  if (!gate.allow) {
    if (isNonRetryableErrorCode(opts.errorCode)) {
      return {
        canRetry: false,
        blockedReason: `Cannot retry error ${opts.errorCode}`,
      };
    }
    return { canRetry: false, blockedReason: gate.error };
  }

  const mode = opts.mode;
  if (mode !== "dry-run" && mode !== "official") {
    return {
      canRetry: false,
      blockedReason:
        "cannot retry — original job config missing (no failed job file or result)",
    };
  }

  if (!opts.preflightOk) {
    return {
      canRetry: false,
      blockedReason:
        "Retry blocked — preflight not green (API key, Docker, or worker). Open Settings, then retry.",
    };
  }

  if (mode === "official" && opts.pilotBlockers.length > 0) {
    return {
      canRetry: false,
      blockedReason: `Official retry blocked — Settings not Ready: ${opts.pilotBlockers.join("; ")}.`,
    };
  }

  const officialGate = officialEnqueueAllowed({
    mode,
    requireWebAuthConfigured: opts.requireWebAuthConfigured,
    webAuthKind: opts.webAuthKind,
    requireEvaluationId: mode === "official",
    evaluationId: opts.evaluationId,
    env: opts.env,
  });
  if (!officialGate.ok) {
    return { canRetry: false, blockedReason: officialGate.error };
  }

  if (opts.costAdmission.blocked) {
    return {
      canRetry: false,
      blockedReason:
        opts.costAdmission.reason ??
        "Retry blocked — per-leg estimate exceeds COST_CAP_USD.",
    };
  }

  return { canRetry: true, blockedReason: null };
}

function loadJobEvaluationId(runId: string): string | undefined {
  const candidates = [
    path.join(jobsDir(), `${runId}.failed.json`),
    path.join(jobsDir(), `${runId}.done.json`),
    path.join(jobsDir(), `${runId}.cancelled.json`),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const job = JobManifestSchema.parse(readJsonFile(p));
      if (typeof job.evaluationId === "string" && job.evaluationId) {
        return job.evaluationId;
      }
    } catch {
      /* try next */
    }
  }
  return undefined;
}

/** Live admission for GET run detail / SSR (mirrors POST /retry gates). */
export function runDetailRetryAdmissionForRun(opts: {
  runId: string;
  status?: {
    status?: string;
    errorCode?: string;
    evaluationId?: string;
    repeats?: number;
  } | null;
  result?: {
    evalSkillId?: string;
    mode?: string;
    repeats?: number;
    evaluationId?: string;
  } | null;
  /** Injected for tests. */
  preflight?: RunPreflightResult;
  hasLiveJob?: boolean;
  staleRunningRunIds?: string[];
  env?: Record<string, string | undefined>;
}): RunDetailRetryAdmission {
  const env = opts.env ?? process.env;
  const preflight = opts.preflight ?? runPreflight();
  const status = opts.status?.status;
  const hasResult = Boolean(opts.result);
  const budgetStopping = status === "budget_stop" && !hasResult;
  const hasLiveJob =
    opts.hasLiveJob ?? hasLiveJobFile(jobsDir(), opts.runId);

  const costParams = resolveRetryCostParams({
    runId: opts.runId,
    result: opts.result,
    status: opts.status,
  });
  const mode = costParams?.mode ?? opts.result?.mode ?? null;
  const evaluationId =
    evaluationIdFromSources({
      statusEvaluationId: opts.status?.evaluationId,
      jobEvaluationId: loadJobEvaluationId(opts.runId),
      resultEvaluationId: opts.result?.evaluationId,
    }) ?? null;

  const staleRunningRunIds =
    opts.staleRunningRunIds ??
    staleOrphanRunningRunIds(jobsDir(), resultsDir(), isPidAlive);
  const pilotBlockers = collectPilotBlockers({
    preflight,
    env,
    staleRunningRunIds,
  });

  const webAuth = resolveWebAuthConfig(env.WEB_AUTH_TOKEN);
  const costAdmission = retryCostAdmissionForRun({
    runId: opts.runId,
    costCapUsd: preflight.costCapUsd,
    result: opts.result,
    status: opts.status,
  });

  return computeRunDetailRetryAdmission({
    status,
    errorCode: opts.status?.errorCode,
    hasLiveJob,
    budgetStopping,
    mode,
    evaluationId,
    preflightOk: preflight.ok,
    pilotBlockers,
    costAdmission,
    env,
    webAuthKind: webAuth.kind,
    requireWebAuthConfigured: env.OFFICIAL_REQUIRES_WEB_AUTH === "true",
  });
}
