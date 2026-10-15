import { NextResponse } from "next/server";
import { loadSettingsSnapshot } from "@/lib/settingsSnapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(loadSettingsSnapshot());
}
