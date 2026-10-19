import { NextResponse } from "next/server";
import {
  hasLiveJobFile,
  loadRunResult,
  syncStatusFromResult,
} from "@skillevalator/core";
import { healRunForFinalize, healRunForRead } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import {
  runCsvExportAllowed,
  runCsvExportBlockReason,
} from "@/lib/runCsvExportAllowed";
import { loadRunDetailEvaluationPack } from "@/lib/runDetailEvaluationPack";
import { runDetailRetryAdmissionForRun } from "@/lib/runDetailRetryAdmission";
import {
  RUN_DETAIL_FAILED_ERROR,
  RUN_DETAIL_INVALID_REQUEST_ERROR,
  RUN_DETAIL_NOT_FOUND_API_ERROR,
} from "@/lib/runDetailResolve";
import { runPreflight } from "@/lib/runPreflight";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await ctx.params;
    const root = resultsDir();
    const finalize =
      new URL(req.url).searchParams.get("finalizeOrphans") === "1";
    if (finalize) {
      healRunForFinalize(runId);
    } else {
      healRunForRead(runId);
    }
    const result = loadRunResult(root, runId);
    const status = syncStatusFromResult(root, runId);
    if (!status && !result) {
      return NextResponse.json(
        {
          error: RUN_DETAIL_NOT_FOUND_API_ERROR,
          errorCode: "run_detail_not_found",
        },
        { status: 404 },
      );
    }
    const { evaluationId, tipCandidateRunId, pairHarness, pairPending } =
      loadRunDetailEvaluationPack({
        runId,
        result,
        status,
      });
    const preflight = runPreflight();
    // Heal already applied above; admission defaults to no full heal (wind-down).
    const retryAdmission = runDetailRetryAdmissionForRun({
      runId,
      result,
      status,
      preflight,
      healQueue: false,
    });
    return NextResponse.json({
      runId,
      status,
      result,
      hasLiveJob: hasLiveJobFile(jobsDir(), runId),
      csvExportAllowed: runCsvExportAllowed({ runId, result, status }),
      csvExportBlockReason: runCsvExportBlockReason({
        runId,
        result,
        status,
      }),
      tipCandidateRunId,
      pairHarness,
      ...(pairPending ? { pairPending } : {}),
      resolvedEvaluationId: evaluationId,
      retryAdmission,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message.startsWith("invalid ")) {
      return NextResponse.json(
        {
          error: message || RUN_DETAIL_INVALID_REQUEST_ERROR,
          errorCode: "run_detail_invalid_request",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: message.trim() ? message : RUN_DETAIL_FAILED_ERROR,
        errorCode: "run_detail_failed",
      },
      { status: 500 },
    );
  }
}
