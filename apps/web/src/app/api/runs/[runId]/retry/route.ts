import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  JobManifestSchema,
  assertSafeId,
  loadRunResult,
  loadRunStatus,
  readJsonFile,
} from "@skillevalator/core";
import { enqueueRun } from "@/lib/enqueueRun";
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

    const job = loadFailedJob(runId);
    const result = loadRunResult(root, runId);

    const evalSkillId = job?.evalSkillId ?? result?.evalSkillId;
    const mode = job?.mode ?? result?.mode;
    const repeats = job?.repeats ?? result?.repeats;
    const modelId = job?.modelId ?? result?.modelId;

    if (!evalSkillId || !mode) {
      return NextResponse.json(
        {
          error:
            "cannot retry — original job config missing (no failed job file or result)",
        },
        { status: 409 },
      );
    }

    const queued = enqueueRun({
      evalSkillId,
      mode,
      repeats,
      modelId,
    });
    if (!queued.ok) {
      return NextResponse.json(
        { error: queued.error },
        { status: queued.status },
      );
    }

    return NextResponse.json({
      ok: true,
      runId: queued.runId,
      fromRunId: runId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
