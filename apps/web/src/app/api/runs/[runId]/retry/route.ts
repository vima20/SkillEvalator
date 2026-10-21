import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  assertSafeId,
  clearRetryMarker,
  findReusableRetryRunId,
  hasLiveJobFile,
  isNonRetryableErrorCode,
  loadRunResult,
  loadRunStatus,
  officialEnqueueAllowed,
  releaseRetryEnqueueLock,
  saveRetryMarker,
  staleOrphanRunningRunIds,
  tryAcquireRetryEnqueueLock,
} from "@skillevalator/core";
import { checkEnqueueCostCap } from "@/lib/enqueueCostGate";
import { enqueueRun } from "@/lib/enqueueRun";
import {
  loadEvaluationMeta,
  resolveHealedMetaLegsForCancel,
  updateEvaluationMetaLeg,
} from "@/lib/evaluations";
import {
  healOrphanStatuses,
  healRunForRead,
  isPidAlive,
} from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import {
  loadTerminalJobForRetry,
  resolveRetryCostParams,
} from "@/lib/retryCostAdmission";
import { resolveRetryRole } from "@/lib/retryRole";
import { resolveRetryEvaluationId } from "@/lib/runDetailEvaluationPack";
import {
  readRetrySnapshotFlags,
  retryPairMetaAdmission,
} from "@/lib/runDetailRetryAdmission";
import {
  isRetryBudgetStopping,
  RETRY_COMPARISON_LINK_FAILED,
  RETRY_CONFIG_MISSING_ERROR,
  RETRY_ENQUEUE_LOCK_BUSY_ERROR,
  RETRY_EVALUATION_META_REVERT_FAILED,
  RETRY_FAILED_ERROR,
  RETRY_INVALID_REQUEST_ERROR,
  RETRY_NOT_FOUND_ERROR,
  RETRY_PREFLIGHT_BLOCKED,
  RETRY_STILL_FINISHING_ERROR,
  retryGate,
  retryNonRetryableBlockedReason,
  retryOfficialPilotBlockedReason,
  retrySnapshotGate,
} from "@/lib/runLifecycle";
import { officialPilotReadyGate } from "@/lib/pilotReady";
import { runPreflight } from "@/lib/runPreflight";
import { resolveWebAuthConfig } from "@/lib/webAuth";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId: raw } = await ctx.params;
    const runId = assertSafeId(raw, "runId");
    const root = resultsDir();
    // Same as Cancel/GET: reclaim dead .running + orphan queued, but do NOT
    // stamp orphan budget_stop → failed (would bypass wind-down / Retry CTA).
    healRunForRead(runId);
    const status = loadRunStatus(root, runId);
    if (!status) {
      return NextResponse.json(
        {
          error: RETRY_NOT_FOUND_ERROR,
          errorCode: "retry_not_found",
        },
        { status: 404 },
      );
    }
    const current = status.status ?? "unknown";
    const result = loadRunResult(root, runId);
    // Match UI retryAdmission: orphan budget_stop without result.json
    // (healed away .running.json) must not enqueue a replacement.
    if (isRetryBudgetStopping(current, Boolean(result))) {
      return NextResponse.json(
        {
          error: RETRY_STILL_FINISHING_ERROR,
          errorCode: "retry_still_finishing",
        },
        { status: 409 },
      );
    }
    const liveJob = hasLiveJobFile(jobsDir(), runId);
    const gate = retryGate({
      status: current,
      hasLiveJob: liveJob,
      nonRetryableError: isNonRetryableErrorCode(status.errorCode),
    });
    if (!gate.allow) {
      const billingBlocked = retryNonRetryableBlockedReason(status.errorCode);
      if (billingBlocked) {
        return NextResponse.json(
          {
            error: billingBlocked,
            errorCode: status.errorCode,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: gate.error,
          errorCode: gate.errorCode,
          ...(liveJob ? { status: current } : {}),
        },
        { status: 409 },
      );
    }

    // Same terminal job loader as retryAdmission / resolveRetryCostParams.
    const terminal = loadTerminalJobForRetry(runId);
    const job = terminal?.job;

    const evalSkillId = job?.evalSkillId ?? result?.evalSkillId;
    const mode = job?.mode ?? result?.mode;
    const repeats = job?.repeats ?? result?.repeats;
    const modelId = job?.modelId ?? result?.modelId;
    const explicitRole =
      status.role === "baseline" || status.role === "candidate"
        ? status.role
        : result?.role === "baseline" || result?.role === "candidate"
          ? result.role
          : terminal?.roleExplicit === "baseline" ||
              terminal?.roleExplicit === "candidate"
            ? terminal.roleExplicit
            : undefined;
    let role = resolveRetryRole({
      statusRole: status.role,
      resultRole: result?.role,
      jobRoleExplicit: terminal?.roleExplicit,
    });
    // Same terminal scan as retryAdmission (skip empty failed.json → done/cancelled).
    const evaluationId = resolveRetryEvaluationId({
      runId,
      status,
      result,
    });

    if (!evalSkillId || !mode) {
      return NextResponse.json(
        {
          error: RETRY_CONFIG_MISSING_ERROR,
          errorCode: "retry_config_missing",
        },
        { status: 409 },
      );
    }

    healOrphanStatuses();
    const preflight = runPreflight();
    if (!preflight.ok) {
      return NextResponse.json(
        {
          error: RETRY_PREFLIGHT_BLOCKED,
          errorCode: "retry_preflight_blocked",
          checks: preflight.checks,
        },
        { status: 503 },
      );
    }
    if (mode === "dry-run" || mode === "official") {
      const readyGate = officialPilotReadyGate({
        mode,
        preflight,
        staleRunningRunIds: staleOrphanRunningRunIds(
          jobsDir(),
          resultsDir(),
          isPidAlive,
        ),
      });
      if (!readyGate.ok) {
        return NextResponse.json(
          {
            error: retryOfficialPilotBlockedReason(readyGate.blockers),
            errorCode: readyGate.errorCode,
            blockers: readyGate.blockers,
          },
          { status: readyGate.status },
        );
      }
      const webAuth = resolveWebAuthConfig(process.env.WEB_AUTH_TOKEN);
      const officialGate = officialEnqueueAllowed({
        mode,
        requireWebAuthConfigured:
          process.env.OFFICIAL_REQUIRES_WEB_AUTH === "true",
        webAuthKind: webAuth.kind,
        // Official retry must stay on a paired evaluation (worker also checks).
        requireEvaluationId: mode === "official",
        evaluationId,
        // Repeats already on the parent job (normalizeRepeats); do not
        // re-fail legacy manifests that predate the API floor.
      });
      if (!officialGate.ok) {
        return NextResponse.json(
          { error: officialGate.error, errorCode: officialGate.errorCode },
          { status: officialGate.status },
        );
      }
    }
    const costParams = resolveRetryCostParams({
      runId,
      result,
      status,
      job: job ?? null,
    });
    if (costParams) {
      const costGate = checkEnqueueCostCap({
        ...costParams,
        costCapUsd: preflight.costCapUsd,
      });
      if (!costGate.ok) {
        return NextResponse.json(
          {
            error: costGate.error,
            errorCode: costGate.errorCode,
            estimatedUsd: costGate.estimatedUsd,
            costCapUsd: costGate.costCapUsd,
          },
          { status: costGate.status },
        );
      }
    }
    // Paired retry: same helper as retryAdmission (heal tip slot like Cancel).
    // healGhostMetaLeg exposes parent in memory while enqueue lock is busy so
    // this is not official_evaluation_leg_mismatch on a ghost tip.
    if (evaluationId && (mode === "dry-run" || mode === "official")) {
      const healed = resolveHealedMetaLegsForCancel(evaluationId);
      const pair = retryPairMetaAdmission({
        runId,
        mode,
        evaluationId,
        explicitRole,
        healed,
      });
      if (!pair.ok) {
        return NextResponse.json(
          { error: pair.error, errorCode: pair.errorCode },
          { status: 409 },
        );
      }
      role = pair.role;
    }

    const loadChild = (childId: string) =>
      loadRunStatus(root, childId)?.status;
    const dedupOpts = { jobsDir: jobsDir(), isPidAlive };

    const linkComparison = (newRunId: string) => {
      if (!evaluationId) return true;
      return updateEvaluationMetaLeg({
        evaluationId,
        role: role === "baseline" ? "baseline" : "candidate",
        runId: newRunId,
        ...(mode === "dry-run" || mode === "official" ? { mode } : {}),
        evalSkillId,
      });
    };

    /**
     * Reused tip children only — must refresh evaluation.json or Comparison
     * stays on the old leg. Never abort/clear the reused child on meta lock
     * miss (TOCTOU: a concurrent retry may already tip the same runId).
     * Fresh enqueues link before the job file and do not use this helper.
     */
    const respondLinked = (opts: {
      newRunId: string;
      reused: boolean;
    }) => {
      const metaUpdated = linkComparison(opts.newRunId);
      if (evaluationId && !metaUpdated) {
        const tipRole = role === "baseline" ? "baseline" : "candidate";
        const meta = loadEvaluationMeta(evaluationId);
        const tipId =
          tipRole === "baseline" ? meta?.baselineRunId : meta?.candidateRunId;
        if (tipId === opts.newRunId) {
          return NextResponse.json({
            ok: true,
            runId: opts.newRunId,
            fromRunId: runId,
            reused: opts.reused,
            role,
            evaluationId,
            evaluationMetaUpdated: true,
          });
        }
        return NextResponse.json(
          {
            ok: false,
            error: RETRY_COMPARISON_LINK_FAILED,
            errorCode: "retry_comparison_link_failed",
            runId: opts.newRunId,
            fromRunId: runId,
            reused: opts.reused,
            aborted: false,
            role,
            evaluationId,
            evaluationMetaUpdated: false,
          },
          { status: 503 },
        );
      }
      return NextResponse.json({
        ok: true,
        runId: opts.newRunId,
        fromRunId: runId,
        reused: opts.reused,
        role,
        evaluationId: evaluationId ?? null,
        evaluationMetaUpdated: metaUpdated,
      });
    };

    const reused = findReusableRetryRunId(root, runId, loadChild, dedupOpts);
    if (reused) {
      return respondLinked({ newRunId: reused, reused: true });
    }

    if (!tryAcquireRetryEnqueueLock(root, runId)) {
      const raced = findReusableRetryRunId(root, runId, loadChild, dedupOpts);
      if (raced) {
        return respondLinked({ newRunId: raced, reused: true });
      }
      return NextResponse.json(
        {
          error: RETRY_ENQUEUE_LOCK_BUSY_ERROR,
          errorCode: "retry_enqueue_lock_busy",
        },
        { status: 409 },
      );
    }

    try {
      // Re-check under lock in case another request just enqueued.
      const reusedUnderLock = findReusableRetryRunId(
        root,
        runId,
        loadChild,
        dedupOpts,
      );
      if (reusedUnderLock) {
        return respondLinked({ newRunId: reusedUnderLock, reused: true });
      }

      // Same snapshot flags as retryAdmission (fail-closed on IO errors).
      const { hasSkillMd, hasPinnedVersion } = readRetrySnapshotFlags(
        root,
        runId,
      );
      const snapGate = retrySnapshotGate({
        role: role === "baseline" ? "baseline" : "candidate",
        hasSkillMd,
        hasPinnedVersion,
      });
      if (!snapGate.allow) {
        return NextResponse.json(
          { error: snapGate.error, errorCode: snapGate.errorCode },
          { status: 409 },
        );
      }
      const skillSnapshotFromRunId = runId;

      // Allocate runId + update evaluation.json BEFORE the job file so the
      // worker never claims an official retry that is not yet a tip meta leg.
      const newRunId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
      if (evaluationId) {
        const metaUpdated = linkComparison(newRunId);
        if (!metaUpdated) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Comparison link update failed before enqueue — try again shortly",
              errorCode: "retry_comparison_link_failed",
              fromRunId: runId,
              evaluationId,
              evaluationMetaUpdated: false,
            },
            { status: 503 },
          );
        }
        // Parent→pending child so healGhostMetaLeg can restore tip if enqueue fails.
        try {
          saveRetryMarker(root, runId, newRunId);
        } catch {
          /* ignore */
        }
      }

      /**
       * Tip already points at newRunId — revert to parent or pair is stuck on
       * our ghost. Concurrent tip moves (other child / parent) are not repair.
       * Keep retry-of.json only while the ghost tip still needs heal.
       */
      const revertTipAfterFailedEnqueue = (enqueueError: string) => {
        if (!evaluationId) return null;
        if (linkComparison(runId)) {
          clearRetryMarker(root, runId);
          return null;
        }
        const tipRole = role === "baseline" ? "baseline" : "candidate";
        const meta = loadEvaluationMeta(evaluationId);
        const tipId =
          tipRole === "baseline"
            ? meta?.baselineRunId
            : meta?.candidateRunId;
        if (tipId !== newRunId) {
          clearRetryMarker(root, runId);
          return null;
        }
        return NextResponse.json(
          {
            ok: false,
            error: RETRY_EVALUATION_META_REVERT_FAILED,
            errorCode: "evaluation_meta_revert_failed",
            enqueueError,
            runId: newRunId,
            fromRunId: runId,
            evaluationId,
            evaluationMetaUpdated: false,
          },
          { status: 503 },
        );
      };

      let queued: ReturnType<typeof enqueueRun>;
      try {
        queued = enqueueRun({
          evalSkillId,
          mode,
          repeats,
          modelId,
          role,
          ...(evaluationId ? { evaluationId } : {}),
          skillSnapshotFromRunId,
          runId: newRunId,
        });
      } catch (enqueueErr) {
        // writeQueuedRun can throw after tip link — do not leave ghost tip.
        const enqueueError =
          enqueueErr instanceof Error
            ? enqueueErr.message
            : "enqueue failed";
        const revertFail = revertTipAfterFailedEnqueue(enqueueError);
        if (revertFail) return revertFail;
        // Tip restored (or concurrent tip moved) — surface enqueue failure here
        // instead of outer catch losing the message context.
        if (enqueueError.startsWith("invalid ")) {
          return NextResponse.json(
            {
              error: enqueueError || RETRY_INVALID_REQUEST_ERROR,
              errorCode: "retry_invalid_request",
            },
            { status: 400 },
          );
        }
        return NextResponse.json(
          {
            ok: false,
            // Stable copy for UI — raw Node/fs detail stays in enqueueError.
            error: RETRY_FAILED_ERROR,
            errorCode: "retry_failed",
            enqueueError,
            fromRunId: runId,
            ...(evaluationId ? { evaluationId } : {}),
          },
          { status: 500 },
        );
      }
      if (!queued.ok) {
        const revertFail = revertTipAfterFailedEnqueue(queued.error);
        if (revertFail) return revertFail;
        return NextResponse.json(
          {
            ok: false,
            error: queued.error,
            errorCode: queued.errorCode,
          },
          { status: queued.status },
        );
      }

      // Best-effort dedup marker — tip+job already live if we got here.
      try {
        saveRetryMarker(root, runId, queued.runId);
      } catch {
        /* ignore */
      }
      return NextResponse.json({
        ok: true,
        runId: queued.runId,
        fromRunId: runId,
        reused: false,
        role,
        evaluationId: evaluationId ?? null,
        evaluationMetaUpdated: Boolean(evaluationId),
      });
    } finally {
      releaseRetryEnqueueLock(root, runId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message.startsWith("invalid ")) {
      return NextResponse.json(
        {
          error: message || RETRY_INVALID_REQUEST_ERROR,
          errorCode: "retry_invalid_request",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: message.trim() ? message : RETRY_FAILED_ERROR,
        errorCode: "retry_failed",
      },
      { status: 500 },
    );
  }
}
