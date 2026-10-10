import { NextResponse } from "next/server";
import { loadRunResult, loadRunStatus } from "@skillevalator/core";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await ctx.params;
    const root = resultsDir();
    const status = loadRunStatus(root, runId);
    const result = loadRunResult(root, runId);
    if (!status && !result) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ runId, status, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
