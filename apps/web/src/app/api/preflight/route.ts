import { NextResponse } from "next/server";
import { runPreflight } from "@/lib/runPreflight";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(runPreflight());
}
