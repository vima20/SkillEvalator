import { NextResponse } from "next/server";
import { assertSafeId, findRepoRoot } from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { resultsDir } from "@/lib/paths";
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
        {
          error: !meta
            ? "evaluation.json missing — pilot archive requires paired meta"
            : "comparison not ready",
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
      metaSmoke: meta.smoke === true,
      baselineFakeProduce: baseline.capture?.env?.fakeProduce === true,
      candidateFakeProduce: candidate.capture?.env?.fakeProduce === true,
      baselineProduceAttested:
        baseline.capture?.env?.produceAttested === true,
      candidateProduceAttested:
        candidate.capture?.env?.produceAttested === true,
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
    const status = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
