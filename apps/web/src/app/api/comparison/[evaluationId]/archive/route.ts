import { NextResponse } from "next/server";
import { assertSafeId, findRepoRoot } from "@skillevalator/core";
import {
  pairExportEvidenceFromPacked,
  pilotArchiveAdoptionFromPacked,
} from "@/lib/evaluationPairBrowse";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { resultsDir } from "@/lib/paths";
import {
  EXPORT_FAILED_ERROR,
  EXPORT_INVALID_REQUEST_ERROR,
} from "@/lib/exportResolve";
import {
  buildPilotArchiveZip,
  pilotArchiveGate,
} from "@/lib/pilotArchive";
import { resolveBuildInfo } from "@/lib/settingsSnapshot";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ evaluationId: string }> },
) {
  try {
    const { evaluationId: raw } = await ctx.params;
    const evaluationId = assertSafeId(raw, "evaluationId");
    const packed = loadEvaluationComparison(evaluationId);
    const { meta, comparison, baseline, candidate } = packed;
    if (!meta || !comparison || !baseline || !candidate) {
      return NextResponse.json(
        !meta
          ? {
              error:
                "evaluation.json missing — pilot archive requires paired meta",
              errorCode: "export_evaluation_meta_missing",
            }
          : {
              error: "comparison not ready",
              errorCode: "export_comparison_not_ready",
            },
        { status: 404 },
      );
    }

    const baselineRunId =
      resolveTipBaselineRunId(packed) ?? meta.baselineRunId;
    const candidateRunId =
      resolveTipCandidateRunId(packed) ?? meta.candidateRunId;

    const gate = pilotArchiveGate({
      comparison,
      ...pairExportEvidenceFromPacked(packed),
    });
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: gate.error,
          errorCode: gate.errorCode,
          verdict: gate.verdict,
          mode: gate.mode,
        },
        { status: gate.status },
      );
    }

    const root = findRepoRoot(process.cwd());
    const zip = buildPilotArchiveZip({
      resultsDir: resultsDir(),
      evaluationId,
      baselineRunId,
      candidateRunId,
      comparison,
      meta,
      build: resolveBuildInfo(root),
      tipEvidence: {
        baselineFakeProduce: baseline.capture?.env?.fakeProduce === true,
        baselineProduceAttested:
          baseline.capture?.env?.produceAttested === true,
        candidateFakeProduce: candidate.capture?.env?.fakeProduce === true,
        candidateProduceAttested:
          candidate.capture?.env?.produceAttested === true,
      },
      adoptionMode: pilotArchiveAdoptionFromPacked(packed).adoptionMode,
    });

    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${evaluationId}-pilot.zip"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message.startsWith("invalid ")) {
      return NextResponse.json(
        {
          error: message || EXPORT_INVALID_REQUEST_ERROR,
          errorCode: "export_invalid_request",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: message.trim() ? message : EXPORT_FAILED_ERROR,
        errorCode: "export_failed",
      },
      { status: 500 },
    );
  }
}
