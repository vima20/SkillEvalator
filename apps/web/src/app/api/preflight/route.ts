import { NextResponse } from "next/server";
import { collectPilotBlockers } from "@/lib/pilotReady";
import { runPreflight } from "@/lib/runPreflight";

export const dynamic = "force-dynamic";

export async function GET() {
  const preflight = runPreflight();
  const pilotBlockers = collectPilotBlockers({ preflight });
  return NextResponse.json({
    ...preflight,
    pilotReady: pilotBlockers.length === 0,
    pilotBlockers,
  });
}
