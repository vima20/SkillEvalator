import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { listRuns, officialEnqueueAllowed } from "@skillevalator/core";
import { enqueueEvaluationPair, enqueueRun } from "@/lib/enqueueRun";
import { healOrphanStatuses } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import { runPreflight } from "@/lib/runPreflight";
import { resolveWebAuthConfig } from "@/lib/webAuth";

const Body = z.object({
  evalSkillId: z.string().min(1),
  mode: z.enum(["dry-run", "official"]),
  repeats: z.number().int().positive().max(10).default(1),
  /**
   * Unikie paired evaluation: queue baseline (neutral) + candidate (SKILL.md).
   * When true, response includes evaluationId and both run ids.
   */
  withBaseline: z.boolean().default(true),
  /** Single-run role when withBaseline is false. */
  role: z.enum(["baseline", "candidate"]).optional(),
});

export async function GET() {
  healOrphanStatuses();
  const runs = listRuns(resultsDir()).map(({ runId, status, result }) => ({
    runId,
    status,
    score: result?.score ?? null,
    modelId: result?.modelId,
    mode: result?.mode,
    role: result?.role,
    evaluationId: result?.evaluationId,
  }));
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const preflight = runPreflight();
    if (!preflight.ok) {
      const failed = Object.entries(preflight.checks)
        .filter(([, c]) => !c.ok)
        .map(([k, c]) => `${k}: ${c.detail}`)
        .join("; ");
      return NextResponse.json(
        {
          error: `preflight failed — ${failed || "fix worker, Docker, or API key"}`,
          checks: preflight.checks,
        },
        { status: 503 },
      );
    }
    const webAuth = resolveWebAuthConfig(process.env.WEB_AUTH_TOKEN);
    const officialGate = officialEnqueueAllowed({
      mode: body.mode,
      requireWebAuthConfigured:
        process.env.OFFICIAL_REQUIRES_WEB_AUTH === "true",
      webAuthKind: webAuth.kind,
      withBaseline: body.withBaseline,
      repeats: body.repeats,
    });
    if (!officialGate.ok) {
      return NextResponse.json(
        { error: officialGate.error, errorCode: officialGate.errorCode },
        { status: officialGate.status },
      );
    }
    if (body.withBaseline) {
      const paired = enqueueEvaluationPair({
        evalSkillId: body.evalSkillId,
        mode: body.mode,
        repeats: body.repeats,
      });
      if (!paired.ok) {
        return NextResponse.json(
          { error: paired.error },
          { status: paired.status },
        );
      }
      return NextResponse.json({
        evaluationId: paired.evaluationId,
        baselineRunId: paired.baselineRunId,
        candidateRunId: paired.candidateRunId,
        runId: paired.candidateRunId,
      });
    }

    const queued = enqueueRun({
      evalSkillId: body.evalSkillId,
      mode: body.mode,
      repeats: body.repeats,
      role: body.role ?? "candidate",
    });
    if (!queued.ok) {
      return NextResponse.json(
        { error: queued.error },
        { status: queued.status },
      );
    }
    return NextResponse.json({ runId: queued.runId });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid request", details: err.flatten() },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "error";
    const status = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
