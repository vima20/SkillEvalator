import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  JobManifestSchema,
  assertSafeId,
  clearRetryMarker,
  findReusableRetryRunId,
  hasLiveJobFile,
  isNonRetryableErrorCode,
  loadRunResult,
  loadRunStatus,
  officialEnqueueAllowed,
  readJsonFile,
  releaseRetryEnqueueLock,
  saveRetryMarker,
  tryAcquireRetryEnqueueLock,
} from "@skillevalator/core";
import { abortQueuedRun, enqueueRun } from "@/lib/enqueueRun";
import {
  loadEvaluationMeta,
  updateEvaluationMetaLeg,
} from "@/lib/evaluations";
import { isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import {
  evaluationIdFromSources,
  resolveRetryRole,
  roleFromJobRaw,
} from "@/lib/retryRole";
import { retryGate, retrySnapshotGate } from "@/lib/runLifecycle";
import { runPreflight } from "@/lib/runPreflight";
import { resolveWebAuthConfig } from "@/lib/webAuth";

export const dynamic = "force-dynamic";

function loadFailedJob(runId: string): {
  job: ReturnType<typeof JobManifestSchema.parse>;
  roleExplicit: ReturnType<typeof roleFromJobRaw>;
} | null {
  const candidates = [
    path.join(jobsDir(), `${runId}.failed.json`),
    path.join(jobsDir(), `${runId}.done.json`),
    path.join(jobsDir(), `${runId}.cancelled.json`),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = readJsonFile(p);
      return {
        job: JobManifestSchema.parse(raw),
        roleExplicit: roleFromJobRaw(raw),
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId: raw } = await ctx.params;
    const runId = assertSafeId(raw, "runId");
    const root = resultsDir();
    const status = loadRunStatus(root, runId);
    if (!status) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const current = status.status ?? "unknown";
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
                ? "No OpenAI credits remaining — add billing credits before retrying (not auto-retried)."
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

    const failed = loadFailedJob(runId);
    const job = failed?.job;
    const result = loadRunResult(root, runId);

    const evalSkillId = job?.evalSkillId ?? result?.evalSkillId;
    const mode = job?.mode ?? result?.mode;
    const repeats = job?.repeats ?? result?.repeats;
    const modelId = job?.modelId ?? result?.modelId;
    const role = resolveRetryRole({
      statusRole: status.role,
      resultRole: result?.role,
      jobRoleExplicit: failed?.roleExplicit,
    });
    const evaluationId = evaluationIdFromSources({
      statusEvaluationId: status.evaluationId,
      jobEvaluationId: job?.evaluationId,
      resultEvaluationId: result?.evaluationId,
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

    const preflight = runPreflight();
    if (!preflight.ok) {
      const failedChecks = Object.entries(preflight.checks)
        .filter(([, c]) => !c.ok)
        .map(([k, c]) => `${k}: ${c.detail}`)
        .join("; ");
      return NextResponse.json(
        {
          error: `preflight failed — ${failedChecks || "fix worker, Docker, or API key"}`,
          checks: preflight.checks,
        },
        { status: 503 },
      );
    }
    if (mode === "dry-run" || mode === "official") {
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
    // Official retry: evaluation.json must exist and parent must be (or have been)
    // a tip leg — refuse forged evaluationId strings with no meta on disk.
    if (mode === "official" && evaluationId) {
      const meta = loadEvaluationMeta(evaluationId);
      if (!meta?.baselineRunId || !meta?.candidateRunId) {
        return NextResponse.json(
          {
            error:
              "official retry requires paired evaluation.json on disk (baseline↔candidate)",
            errorCode: "official_evaluation_meta_missing",
          },
          { status: 409 },
        );
      }
      const legs = [meta.baselineRunId, meta.candidateRunId];
      if (!legs.includes(runId)) {
        return NextResponse.json(
          {
            error:
              "official retry parent runId is not a current Comparison meta leg — retry from the tip baseline/candidate",
            errorCode: "official_evaluation_leg_mismatch",
          },
          { status: 409 },
        );
      }
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
        if (!opts.reused) {
          abortQueuedRun(
            opts.newRunId,
            "Comparison link update failed after retry enqueue",
            {
              role: role === "baseline" ? "baseline" : "candidate",
              evaluationId,
            },
          );
          clearRetryMarker(root, runId);
        }
        return NextResponse.json(
          {
            ok: false,
            error: opts.reused
              ? "Comparison link update failed — retry again shortly to repair the pair"
              : "Comparison link update failed — queued retry was aborted; try again shortly",
            runId: opts.newRunId,
            fromRunId: runId,
            reused: opts.reused,
            aborted: !opts.reused,
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
        { error: "retry already in progress — try again shortly" },
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

      const snapshotDir = path.join(root, runId, "skill-snapshot");
      const snapshotPath = path.join(snapshotDir, "SKILL.md");
      const snapManifestPath = path.join(snapshotDir, "manifest.json");
      // Exists alone is not enough — empty/whitespace SKILL.md must not pin.
      let hasSkillMd = false;
      if (fs.existsSync(snapshotPath)) {
        try {
          hasSkillMd =
            fs.readFileSync(snapshotPath, "utf8").trim().length > 0;
        } catch {
          hasSkillMd = false;
        }
      }
      let hasPinnedVersion = false;
      if (fs.existsSync(snapManifestPath)) {
        try {
          const raw = JSON.parse(
            fs.readFileSync(snapManifestPath, "utf8"),
          ) as { _snapshot?: { evalSkillVersion?: string } };
          hasPinnedVersion = Boolean(
            raw._snapshot?.evalSkillVersion?.trim(),
          );
        } catch {
          hasPinnedVersion = false;
        }
      }
      // Never silently fall through to a drifted live skill/fixture tree.
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
          // Best-effort revert tip to parent so Comparison does not point at a
          // never-queued runId.
          linkComparison(runId);
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
