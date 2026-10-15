import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  purgeSmokeNoiseFs,
  purgeTerminalRunsFs,
  recordPurgeAudit,
} from "@skillevalator/core";
import { jobsDir, resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** `age` (default) = old terminal runs; `smoke` = FAKE_PRODUCE / smoke plants. */
  kind: z.enum(["age", "smoke"]).default("age"),
  /**
   * Age purge only: delete terminal runs whose status.json is older than this many days.
   * Min 1 — olderThanDays:0 would wipe every settled run immediately.
   */
  olderThanDays: z.number().int().min(1).max(365).default(7),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json().catch(() => ({})));

    if (body.kind === "smoke") {
      const { removed, removedEvaluations, skipped } = purgeSmokeNoiseFs(
        resultsDir(),
        jobsDir(),
      );
      recordPurgeAudit(resultsDir(), [
        ...removed,
        ...removedEvaluations.map((id) => `eval:${id}`),
      ]);
      return NextResponse.json({
        ok: true,
        kind: "smoke",
        removedCount: removed.length,
        removed,
        removedEvaluations,
        removedEvaluationCount: removedEvaluations.length,
        skippedCount: skipped.length,
        skipped: skipped.slice(0, 50),
      });
    }

    const olderThanMs = body.olderThanDays * 24 * 60 * 60 * 1000;
    const { removed, skipped } = purgeTerminalRunsFs(resultsDir(), jobsDir(), {
      olderThanMs,
    });
    recordPurgeAudit(resultsDir(), removed);
    return NextResponse.json({
      ok: true,
      kind: "age",
      olderThanDays: body.olderThanDays,
      removedCount: removed.length,
      removed,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 50),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid request", details: err.flatten() },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
