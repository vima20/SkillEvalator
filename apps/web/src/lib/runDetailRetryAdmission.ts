import fs from "node:fs";
import path from "node:path";
import {
  hasLiveJobFile,
  isNonRetryableErrorCode,
  officialEnqueueAllowed,
  resolveEvalRole,
  staleOrphanRunningRunIds,
  type EvalRole,
} from "@skillevalator/core";
import { resolveHealedMetaLegsForCancel } from "@/lib/evaluations";
import { healOrphanStatuses, isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { collectPilotBlockers } from "@/lib/pilotReady";
import { resolveRetryEvaluationId } from "@/lib/runDetailEvaluationPack";
import {
  isRetryBudgetStopping,
  RETRY_STILL_FINISHING_ERROR,
  retryGate,
  retrySnapshotGate,
} from "@/lib/runLifecycle";
import { runPreflight, type RunPreflightResult } from "@/lib/runPreflight";
import {
  loadTerminalJobForRetry,
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

/** Pure pair-meta gate (same messages + errorCodes as POST /retry). */
export function retryPairMetaAdmission(opts: {
  runId: string;
  mode: "dry-run" | "official";
  evaluationId?: string | null;
  explicitRole?: EvalRole;
  healed: { baselineRunId: string; candidateRunId: string } | null;
}):
  | { ok: true; role: EvalRole }
  | { ok: false; error: string; errorCode: string } {
  if (!opts.evaluationId) {
    return { ok: true, role: opts.explicitRole ?? "candidate" };
  }
  if (!opts.healed) {
    if (opts.mode === "official") {
      return {
        ok: false,
        error:
          "official retry requires paired evaluation.json on disk (baseline↔candidate)",
        errorCode: "official_evaluation_meta_missing",
      };
    }
    return { ok: true, role: opts.explicitRole ?? "candidate" };
  }
  const metaSlot =
    opts.runId === opts.healed.baselineRunId
      ? ("baseline" as const)
      : opts.runId === opts.healed.candidateRunId
        ? ("candidate" as const)
        : null;
  if (!metaSlot) {
    return {
      ok: false,
      error:
        "paired retry parent runId is not a current Comparison meta leg — retry from the tip baseline/candidate",
      errorCode: "official_evaluation_leg_mismatch",
    };
  }
  if (opts.explicitRole && opts.explicitRole !== metaSlot) {
    return {
      ok: false,
      error: `retry role ${opts.explicitRole} does not match evaluation meta slot ${metaSlot}`,
      errorCode: "official_evaluation_role_slot_mismatch",
    };
  }
  return { ok: true, role: metaSlot };
}

/** Read skill-snapshot flags for retrySnapshotGate (fail-closed on IO errors). */
export function readRetrySnapshotFlags(
  resultsRoot: string,
  runId: string,
): { hasSkillMd: boolean; hasPinnedVersion: boolean } {
  const snapshotDir = path.join(resultsRoot, runId, "skill-snapshot");
  const snapshotPath = path.join(snapshotDir, "SKILL.md");
  const snapManifestPath = path.join(snapshotDir, "manifest.json");
  let hasSkillMd = false;
  if (fs.existsSync(snapshotPath)) {
    try {
      hasSkillMd = fs.readFileSync(snapshotPath, "utf8").trim().length > 0;
    } catch {
      hasSkillMd = false;
    }
  }
  let hasPinnedVersion = false;
  if (fs.existsSync(snapManifestPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(snapManifestPath, "utf8")) as {
        _snapshot?: { evalSkillVersion?: string };
      };
      hasPinnedVersion = Boolean(raw._snapshot?.evalSkillVersion?.trim());
    } catch {
      hasPinnedVersion = false;
    }
  }
  return { hasSkillMd, hasPinnedVersion };
}

/**
 * Pure admission mirroring POST /api/runs/[runId]/retry order.
 * Injected deps keep vitest free of Docker/fs.
 */
export function computeRunDetailRetryAdmission(opts: {
  runId: string;
  status?: string;
  errorCode?: string;
  hasLiveJob: boolean;
  /** Wind-down: status budget_stop, no result yet. */
  budgetStopping?: boolean;
  mode?: string | null;
  evaluationId?: string | null;
  explicitRole?: EvalRole;
  healedMeta?: { baselineRunId: string; candidateRunId: string } | null;
  /** When pair meta does not override — same as resolveEvalRole default. */
  roleFallback?: EvalRole;
  snapshotFlags?: { hasSkillMd: boolean; hasPinnedVersion: boolean };
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
      blockedReason: RETRY_STILL_FINISHING_ERROR,
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

  const pair = retryPairMetaAdmission({
    runId: opts.runId,
    mode,
    evaluationId: opts.evaluationId,
    explicitRole: opts.explicitRole,
    healed: opts.healedMeta ?? null,
  });
  if (!pair.ok) {
    return { canRetry: false, blockedReason: pair.error };
  }

  const role =
    pair.role ??
    opts.roleFallback ??
    opts.explicitRole ??
    "candidate";
  const flags = opts.snapshotFlags ?? {
    hasSkillMd: false,
    hasPinnedVersion: false,
  };
  const snapGate = retrySnapshotGate({
    role,
    hasSkillMd: flags.hasSkillMd,
    hasPinnedVersion: flags.hasPinnedVersion,
  });
  if (!snapGate.allow) {
    return { canRetry: false, blockedReason: snapGate.error };
  }

  return { canRetry: true, blockedReason: null };
}

/** Live admission for GET run detail / SSR (mirrors POST /retry gates). */
export function runDetailRetryAdmissionForRun(opts: {
  runId: string;
  status?: {
    status?: string;
    errorCode?: string;
    evaluationId?: string;
    repeats?: number;
    role?: string;
  } | null;
  result?: {
    evalSkillId?: string;
    mode?: string;
    repeats?: number;
    evaluationId?: string;
    role?: string;
  } | null;
  /** Injected for tests. */
  preflight?: RunPreflightResult;
  hasLiveJob?: boolean;
  staleRunningRunIds?: string[];
  /**
   * Opt-in full healAllOrphansFs before stale inspect (same as Settings
   * healQueue). Default false — passive SSR/GET poll must not stamp orphan
   * budget_stop → failed (wind-down Cancel). POST /retry heals separately.
   */
  healQueue?: boolean;
  env?: Record<string, string | undefined>;
  healedMeta?: { baselineRunId: string; candidateRunId: string } | null;
  snapshotFlags?: { hasSkillMd: boolean; hasPinnedVersion: boolean };
}): RunDetailRetryAdmission {
  const env = opts.env ?? process.env;
  const preflight = opts.preflight ?? runPreflight();
  const status = opts.status?.status;
  const hasResult = Boolean(opts.result);
  const budgetStopping = isRetryBudgetStopping(status, hasResult);
  const hasLiveJob =
    opts.hasLiveJob ?? hasLiveJobFile(jobsDir(), opts.runId);

  const costParams = resolveRetryCostParams({
    runId: opts.runId,
    result: opts.result,
    status: opts.status,
  });
  // Same job → result mode as POST /retry (do not prefer result over job).
  const mode = costParams?.mode ?? null;
  const terminalJob = loadTerminalJobForRetry(opts.runId);
  // Same terminal evaluationId scan as POST /retry (not live-job display id).
  const evaluationId = resolveRetryEvaluationId({
    runId: opts.runId,
    status: opts.status,
    result: opts.result,
  });

  const statusRole =
    opts.status?.role === "baseline" || opts.status?.role === "candidate"
      ? opts.status.role
      : undefined;
  const resultRole =
    opts.result?.role === "baseline" || opts.result?.role === "candidate"
      ? opts.result.role
      : undefined;
  const jobRoleExplicit = terminalJob?.roleExplicit;
  const explicitRole =
    statusRole ?? resultRole ?? jobRoleExplicit ?? undefined;
  const roleFallback = resolveEvalRole({
    statusRole,
    resultRole,
    jobRoleExplicit,
  });

  const healedMeta =
    opts.healedMeta !== undefined
      ? opts.healedMeta
      : evaluationId
        ? resolveHealedMetaLegsForCancel(evaluationId)
        : null;

  const snapshotFlags =
    opts.snapshotFlags ??
    readRetrySnapshotFlags(resultsDir(), opts.runId);

  // Opt-in only — browse/read heal already reclaimed dead .running.json.
  if (opts.healQueue === true) {
    healOrphanStatuses();
  }
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
    runId: opts.runId,
    status,
    errorCode: opts.status?.errorCode,
    hasLiveJob,
    budgetStopping,
    mode,
    evaluationId,
    explicitRole,
    healedMeta,
    roleFallback,
    snapshotFlags,
    preflightOk: preflight.ok,
    pilotBlockers,
    costAdmission,
    env,
    webAuthKind: webAuth.kind,
    requireWebAuthConfigured: env.OFFICIAL_REQUIRES_WEB_AUTH === "true",
  });
}
