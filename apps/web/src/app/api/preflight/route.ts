import { NextResponse } from "next/server";
import { staleOrphanRunningRunIds } from "@skillevalator/core";
import { healOrphanStatuses, isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { collectPilotBlockers } from "@/lib/pilotReady";
import { runPreflight } from "@/lib/runPreflight";

export const dynamic = "force-dynamic";

export async function GET() {
  // Heal first so New run Ready matches a fresh queue (Settings Refresh).
  healOrphanStatuses();
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
}
