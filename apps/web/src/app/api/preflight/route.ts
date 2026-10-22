import { NextResponse } from "next/server";
import { staleOrphanRunningRunIds } from "@skillevalator/core";
import { healOrphansForBrowse, isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { collectPilotBlockers } from "@/lib/pilotReady";
import { runPreflight } from "@/lib/runPreflight";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Browse heal only — New run polls this every ~8s; full heal would stamp
    // orphan budget_stop → failed before the 90s Cancel / finalizeOrphans window.
    // Explicit full heal stays on Settings Refresh (?heal=1) and POST enqueue/retry.
    healOrphansForBrowse();
    const preflight = runPreflight();
    const staleRunningRunIds = staleOrphanRunningRunIds(
      jobsDir(),
      resultsDir(),
      isPidAlive,
    );
    const pilotBlockers = collectPilotBlockers({
      preflight,
      staleRunningRunIds,
    });
    return NextResponse.json({
      ...preflight,
      pilotReady: pilotBlockers.length === 0,
      pilotBlockers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "preflight failed";
    return NextResponse.json(
      {
        ok: false,
        pilotReady: false,
        pilotBlockers: [`Preflight error: ${message}`],
        checks: {
          openaiApiKey: { ok: false, detail: message },
          docker: { ok: false, detail: message },
          worker: { ok: false, detail: message },
        },
        checkedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
