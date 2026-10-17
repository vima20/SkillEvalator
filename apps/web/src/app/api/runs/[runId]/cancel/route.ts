import { NextResponse } from "next/server";
import { cancelRunWithCascade } from "@/lib/cancelRun";
import {
  CANCEL_FAILED_ERROR,
  CANCEL_INVALID_REQUEST_ERROR,
} from "@/lib/runLifecycle";

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
    if (message.startsWith("invalid ")) {
      return NextResponse.json(
        {
          error: message || CANCEL_INVALID_REQUEST_ERROR,
          errorCode: "cancel_invalid_request",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: message.trim() ? message : CANCEL_FAILED_ERROR,
        errorCode: "cancel_failed",
      },
      { status: 500 },
    );
  }
}
