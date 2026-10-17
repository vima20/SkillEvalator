import { NextResponse } from "next/server";
import { healOrphansForBrowse } from "@/lib/healOrphans";
import { loadSettingsSnapshot } from "@/lib/settingsSnapshot";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const fullHeal =
    new URL(req.url).searchParams.get("heal") === "1";
  if (fullHeal) {
    // Manual Settings Refresh — healAllOrphansFs (orphan budget_stop → failed).
    return NextResponse.json(loadSettingsSnapshot({ healQueue: true }), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  // Silent poll / default GET — browse heal only (wind-down Cancel survives).
  healOrphansForBrowse();
  return NextResponse.json(loadSettingsSnapshot({ healQueue: false }), {
    headers: { "Cache-Control": "no-store" },
  });
}
