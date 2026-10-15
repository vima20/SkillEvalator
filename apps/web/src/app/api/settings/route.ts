import { NextResponse } from "next/server";
import { loadSettingsSnapshot } from "@/lib/settingsSnapshot";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const healQueue =
    new URL(req.url).searchParams.get("heal") === "1";
  return NextResponse.json(loadSettingsSnapshot({ healQueue }), {
    headers: { "Cache-Control": "no-store" },
  });
}
