import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { listRuns } from "@skillevalator/core";
import { enqueueRun } from "@/lib/enqueueRun";
import { healOrphanStatuses } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";

const Body = z.object({
  evalSkillId: z.string().min(1),
  mode: z.enum(["dry-run", "official"]),
  repeats: z.number().int().positive().max(10).default(1),
});

export async function GET() {
  healOrphanStatuses();
  const runs = listRuns(resultsDir()).map(({ runId, status, result }) => ({
    runId,
    status,
    score: result?.score ?? null,
    modelId: result?.modelId,
    mode: result?.mode,
  }));
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const queued = enqueueRun({
      evalSkillId: body.evalSkillId,
      mode: body.mode,
      repeats: body.repeats,
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
