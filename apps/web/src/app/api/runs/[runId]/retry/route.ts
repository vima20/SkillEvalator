import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  JobManifestSchema,
  assertSafeId,
  findReusableRetryRunId,
  isNonRetryableErrorCode,
  loadRunResult,
  loadRunStatus,
  readJsonFile,
  releaseRetryEnqueueLock,
  saveRetryMarker,
  tryAcquireRetryEnqueueLock,
} from "@skillevalator/core";
import { enqueueRun } from "@/lib/enqueueRun";
import { isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const RETRYABLE = new Set(["failed", "cancelled", "budget_stop"]);

function loadFailedJob(runId: string) {
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
    if (!RETRYABLE.has(current)) {
      return NextResponse.json(
        { error: `cannot retry status ${current}` },
        { status: 409 },
      );
    }
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

    const job = loadFailedJob(runId);
    const result = loadRunResult(root, runId);

    const evalSkillId = job?.evalSkillId ?? result?.evalSkillId;
    const mode = job?.mode ?? result?.mode;
    const repeats = job?.repeats ?? result?.repeats;
    const modelId = job?.modelId ?? result?.modelId;
    const role = job?.role ?? result?.role ?? "candidate";
    const evaluationId = job?.evaluationId ?? result?.evaluationId;

    if (!evalSkillId || !mode) {
      return NextResponse.json(
        {
          error:
            "cannot retry — original job config missing (no failed job file or result)",
        },
        { status: 409 },
      );
    }

    const loadChild = (childId: string) =>
      loadRunStatus(root, childId)?.status;
    const dedupOpts = { jobsDir: jobsDir(), isPidAlive };

    const reused = findReusableRetryRunId(root, runId, loadChild, dedupOpts);
    if (reused) {
      return NextResponse.json({
        ok: true,
        runId: reused,
        fromRunId: runId,
        reused: true,
      });
    }

    if (!tryAcquireRetryEnqueueLock(root, runId)) {
      const raced = findReusableRetryRunId(root, runId, loadChild, dedupOpts);
      if (raced) {
        return NextResponse.json({
          ok: true,
          runId: raced,
          fromRunId: runId,
          reused: true,
        });
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
        return NextResponse.json({
          ok: true,
          runId: reusedUnderLock,
          fromRunId: runId,
          reused: true,
        });
      }

      const queued = enqueueRun({
        evalSkillId,
        mode,
        repeats,
        modelId,
        role,
        evaluationId,
      });
      if (!queued.ok) {
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
