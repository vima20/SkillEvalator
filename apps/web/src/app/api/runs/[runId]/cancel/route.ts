import { NextResponse } from "next/server";
import { cancelRunWithCascade } from "@/lib/cancelRun";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId: raw } = await ctx.params;
    const out = cancelRunWithCascade(raw);
    if (!out.ok) {
      return NextResponse.json(
        { error: out.error, errorCode: out.errorCode },
        { status: out.status },
      );
    }
    return NextResponse.json({
      runId: out.runId,
      ok: true,
      already: out.already,
      status: out.status,
      ...(out.alsoCancelled ? { alsoCancelled: out.alsoCancelled } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
