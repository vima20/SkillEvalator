import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  purgeTerminalRunsFs,
  recordPurgeAudit,
} from "@skillevalator/core";
import { jobsDir, resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** Delete terminal runs whose status.json is older than this many days. */
  olderThanDays: z.number().int().min(0).max(365).default(7),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    const olderThanMs = body.olderThanDays * 24 * 60 * 60 * 1000;
    const { removed } = purgeTerminalRunsFs(
      resultsDir(),
      jobsDir(),
      { olderThanMs },
    );
    recordPurgeAudit(resultsDir(), removed);
    return NextResponse.json({
      ok: true,
      olderThanDays: body.olderThanDays,
      removedCount: removed.length,
      removed,
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
