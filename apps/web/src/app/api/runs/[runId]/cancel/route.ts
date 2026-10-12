import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  assertSafeId,
  loadRunStatus,
  readJsonFile,
  writeJsonFile,
} from "@skillevalator/core";
import { jobsDir, resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ok", "failed", "cancelled", "budget_stop"]);
const CANCELLABLE = new Set(["queued", "running", "cancel_requested"]);

type CancelOutcome =
  | { ok: true; status: "cancelled" | "cancel_requested"; already?: boolean }
  | { ok: false; status: number; error: string };

function requestCancelOne(runId: string): CancelOutcome {
  const root = resultsDir();
  const status = loadRunStatus(root, runId);
  if (!status) {
    return { ok: false, status: 404, error: "not found" };
  }

  const current = status.status ?? "unknown";
  if (current === "cancelled") {
    return { ok: true, status: "cancelled", already: true };
  }
  if (TERMINAL.has(current)) {
    return {
      ok: false,
      status: 409,
      error: `run already finished (${current})`,
    };
  }
  if (!CANCELLABLE.has(current)) {
    return {
      ok: false,
      status: 409,
      error: `cannot cancel status ${current}`,
    };
  }

  const dir = jobsDir();
  fs.mkdirSync(dir, { recursive: true });
  if (current === "cancel_requested") {
    return { ok: true, status: "cancel_requested", already: true };
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
      ...(typeof status.costUsd === "number" ? { costUsd: status.costUsd } : {}),
      ...(typeof status.repeat === "number" ? { repeat: status.repeat } : {}),
      ...(typeof status.repeats === "number" ? { repeats: status.repeats } : {}),
    });
  }

  return {
    ok: true,
    status: immediate ? "cancelled" : "cancel_requested",
  };
}

/** Sibling baseline/candidate run for the same Comparison, if any. */
function pairedSiblingRunId(runId: string, evaluationId: string): string | null {
  try {
    const metaPath = path.join(
      resultsDir(),
      assertSafeId(evaluationId, "evaluationId"),
      "evaluation.json",
    );
    if (!fs.existsSync(metaPath)) return null;
    const meta = readJsonFile(metaPath) as {
      baselineRunId?: string;
      candidateRunId?: string;
    };
    const baseline =
      typeof meta.baselineRunId === "string" ? meta.baselineRunId : null;
    const candidate =
      typeof meta.candidateRunId === "string" ? meta.candidateRunId : null;
    if (baseline === runId && candidate) return candidate;
    if (candidate === runId && baseline) return baseline;
    return null;
  } catch {
    return null;
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId: raw } = await ctx.params;
    const runId = assertSafeId(raw, "runId");
    const prior = loadRunStatus(resultsDir(), runId);
    const evaluationId =
      typeof prior?.evaluationId === "string" ? prior.evaluationId : null;

    const primary = requestCancelOne(runId);
    if (!primary.ok) {
      return NextResponse.json(
        { error: primary.error },
        { status: primary.status },
      );
    }

    let siblingCancelled: string | null = null;
    if (evaluationId) {
      const sibling = pairedSiblingRunId(runId, evaluationId);
      if (sibling && sibling !== runId) {
        const sib = requestCancelOne(sibling);
        if (sib.ok && !sib.already) siblingCancelled = sibling;
      }
    }

    return NextResponse.json({
      runId,
      ok: true,
      already: primary.already === true,
      status: primary.status,
      ...(siblingCancelled ? { alsoCancelled: siblingCancelled } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
