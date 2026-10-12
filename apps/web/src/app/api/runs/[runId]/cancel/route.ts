import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  assertSafeId,
  loadRunStatus,
  writeJsonFile,
} from "@skillevalator/core";
import { jobsDir, resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ok", "failed", "cancelled", "budget_stop"]);
const CANCELLABLE = new Set(["queued", "running", "cancel_requested"]);

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId: raw } = await ctx.params;
    const runId = assertSafeId(raw, "runId");
    const root = resultsDir();
    const status = loadRunStatus(root, runId);
    if (!status) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const current = status.status ?? "unknown";
    if (current === "cancelled") {
      return NextResponse.json({
        runId,
        ok: true,
        already: true,
        status: "cancelled",
      });
    }
    if (TERMINAL.has(current)) {
      return NextResponse.json(
        { error: `run already finished (${current})` },
        { status: 409 },
      );
    }
    if (!CANCELLABLE.has(current)) {
      return NextResponse.json(
        { error: `cannot cancel status ${current}` },
        { status: 409 },
      );
    }

    const dir = jobsDir();
    fs.mkdirSync(dir, { recursive: true });
    if (current === "cancel_requested") {
      return NextResponse.json({
        runId,
        ok: true,
        already: true,
        status: "cancel_requested",
      });
    }

    const cancelPath = path.join(dir, `${runId}.cancel`);
    fs.writeFileSync(cancelPath, `${new Date().toISOString()}\n`, "utf8");

    const pairingMeta = {
      ...(status.role ? { role: status.role } : {}),
      ...(status.evaluationId ? { evaluationId: status.evaluationId } : {}),
    };

    const queuedPath = path.join(dir, `${runId}.json`);
    let immediate = false;
    if (fs.existsSync(queuedPath)) {
      try {
        fs.renameSync(queuedPath, path.join(dir, `${runId}.cancelled.json`));
        writeJsonFile(path.join(root, runId, "status.json"), {
          runId,
          status: "cancelled",
          ...pairingMeta,
        });
        immediate = true;
      } catch {
        /* claimed concurrently — worker honors .cancel */
      }
    }

    if (!immediate) {
      writeJsonFile(path.join(root, runId, "status.json"), {
        runId,
        status: "cancel_requested",
        ...pairingMeta,
        ...(typeof status.costUsd === "number"
          ? { costUsd: status.costUsd }
          : {}),
        ...(typeof status.repeat === "number" ? { repeat: status.repeat } : {}),
        ...(typeof status.repeats === "number"
          ? { repeats: status.repeats }
          : {}),
      });
    }

    return NextResponse.json({
      runId,
      ok: true,
      status: immediate ? "cancelled" : "cancel_requested",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
