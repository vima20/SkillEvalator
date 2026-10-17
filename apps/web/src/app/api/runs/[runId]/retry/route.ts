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
  RETRY_ENQUEUE_LOCK_BUSY_ERROR,
  saveRetryMarker,
  staleOrphanRunningRunIds,
  tryAcquireRetryEnqueueLock,
} from "@skillevalator/core";
import { checkEnqueueCostCap } from "@/lib/enqueueCostGate";
import { abortQueuedRun, enqueueRun } from "@/lib/enqueueRun";
import {
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
  RETRY_INSUFFICIENT_QUOTA_BLOCKED,
  RETRY_PREFLIGHT_BLOCKED,
  RETRY_STILL_FINISHING_ERROR,
  retryGate,
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
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const current = status.status ?? "unknown";
    const result = loadRunResult(root, runId);
    // Match UI retryAdmission: orphan budget_stop without result.json
    // (healed away .running.json) must not enqueue a replacement.
    if (isRetryBudgetStopping(current, Boolean(result))) {
      return NextResponse.json(
        { error: RETRY_STILL_FINISHING_ERROR },
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
      if (isNonRetryableErrorCode(status.errorCode)) {
        return NextResponse.json(
          {
            error:
              status.errorCode === "insufficient_quota"
                ? RETRY_INSUFFICIENT_QUOTA_BLOCKED
                : `Cannot retry error ${status.errorCode}`,
            errorCode: status.errorCode,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: gate.error,
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
          error:
            "cannot retry — original job config missing (no failed job file or result)",
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
            error: readyGate.error,
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
     * Paired retries must update evaluation.json or Comparison stays on the old leg.
     * Fresh enqueues that fail the meta link are aborted so we do not leave a
     * paid orphan that Comparison will ignore.
     */
    const respondLinked = (opts: {
      newRunId: string;
      reused: boolean;
    }) => {
      const metaUpdated = linkComparison(opts.newRunId);
      if (evaluationId && !metaUpdated) {
        // Fresh or reused: do not leave a live child off the Comparison tip.
        abortQueuedRun(
          opts.newRunId,
          "Comparison link update failed after retry enqueue",
          {
            role: role === "baseline" ? "baseline" : "candidate",
            evaluationId,
          },
        );
        clearRetryMarker(root, runId);
        return NextResponse.json(
          {
            ok: false,
            error:
              "Comparison link update failed — retry child was cancelled; try again shortly",
            runId: opts.newRunId,
            fromRunId: runId,
            reused: opts.reused,
            aborted: true,
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
        return NextResponse.json({ error: snapGate.error }, { status: 409 });
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
              fromRunId: runId,
              evaluationId,
              evaluationMetaUpdated: false,
            },
            { status: 503 },
          );
        }
      }

      const queued = enqueueRun({
        evalSkillId,
        mode,
        repeats,
        modelId,
        role,
        evaluationId,
        skillSnapshotFromRunId,
        runId: newRunId,
      });
      if (!queued.ok) {
        if (evaluationId) {
          // Tip already points at newRunId — revert must succeed or pair is stuck.
          const reverted = linkComparison(runId);
          if (!reverted) {
            return NextResponse.json(
              {
                ok: false,
                error:
                  "enqueue failed and Comparison tip revert failed — repair the pair shortly",
                errorCode: "evaluation_meta_revert_failed",
                enqueueError: queued.error,
                runId: newRunId,
                fromRunId: runId,
                evaluationId,
                evaluationMetaUpdated: false,
              },
              { status: 503 },
            );
          }
        }
        return NextResponse.json(
          { error: queued.error },
          { status: queued.status },
        );
      }

      saveRetryMarker(root, runId, queued.runId);
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
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
