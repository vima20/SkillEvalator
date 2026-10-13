import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  assertSafeId,
  loadRunStatus,
  readJsonFile,
  resolvePairedCancelSibling,
  writeJsonFile,
} from "@skillevalator/core";
import { jobsDir, resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ok", "failed", "cancelled"]);
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
  const hasResult = fs.existsSync(path.join(root, runId, "result.json"));
  // budget_stop without result.json is wind-down — allow .cancel so worker
  // can finalize as cancelled (resolveFinalRunStop) and Retry becomes usable.
  const windDownCancellable = current === "budget_stop" && !hasResult;
  if (TERMINAL.has(current) || (current === "budget_stop" && hasResult)) {
    return {
      ok: false,
      status: 409,
      error: `run already finished (${current})`,
    };
  }
  if (!CANCELLABLE.has(current) && !windDownCancellable) {
    return {
      ok: false,
      status: 409,
      error: `cannot cancel status ${current}`,
    };
  }

  const dir = jobsDir();
  fs.mkdirSync(dir, { recursive: true });
  // Always (re)write .cancel so a lost marker still stops the worker.
  const cancelPath = path.join(dir, `${runId}.cancel`);
  fs.writeFileSync(cancelPath, `${new Date().toISOString()}\n`, "utf8");

  if (current === "cancel_requested") {
    return { ok: true, status: "cancel_requested", already: true };
  }

  const pairingMeta = {
    ...(status.role ? { role: status.role } : {}),
    ...(status.evaluationId ? { evaluationId: status.evaluationId } : {}),
  };

  const cancelledPath = path.join(dir, `${runId}.cancelled.json`);
  let immediate = false;
  for (const queuedName of [`${runId}.json`, `${runId}.tmp.json`]) {
    const queuedPath = path.join(dir, queuedName);
    if (!fs.existsSync(queuedPath)) continue;
    try {
      fs.renameSync(queuedPath, cancelledPath);
      writeJsonFile(path.join(root, runId, "status.json"), {
        runId,
        status: "cancelled",
        ...pairingMeta,
      });
      immediate = true;
      break;
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

function loadEvaluationMetaLegs(evaluationId: string): {
  baselineRunId: string;
  candidateRunId: string;
} | null {
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
    if (
      typeof meta.baselineRunId !== "string" ||
      typeof meta.candidateRunId !== "string"
    ) {
      return null;
    }
    return {
      baselineRunId: meta.baselineRunId,
      candidateRunId: meta.candidateRunId,
    };
  } catch {
    return null;
  }
}

/** Sibling baseline/candidate run for the same Comparison, if any. */
function pairedSiblingRunId(
  runId: string,
  evaluationId: string,
  role?: string,
): string | null {
  const root = resultsDir();
  const meta = loadEvaluationMetaLegs(evaluationId);
  const peers: Array<{ runId: string; role?: string; status?: string }> = [];
  try {
    for (const name of fs.readdirSync(root)) {
      if (name === runId || name.startsWith("eval_")) continue;
      try {
        assertSafeId(name, "runId");
      } catch {
        continue;
      }
      const st = loadRunStatus(root, name);
      if (st?.evaluationId !== evaluationId) continue;
      peers.push({
        runId: name,
        role: st.role,
        status: st.status,
      });
    }
  } catch {
    /* ignore */
  }
  return resolvePairedCancelSibling({
    runId,
    role,
    meta,
    peers,
    // Include budget_stop so a wind-down peer can be cascade-cancelled;
    // requestCancelOne still rejects settled budget_stop (has result.json).
    cancellableStatuses: new Set([...CANCELLABLE, "budget_stop"]),
  });
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
    const role = typeof prior?.role === "string" ? prior.role : undefined;

    const primary = requestCancelOne(runId);
    if (!primary.ok) {
      return NextResponse.json(
        { error: primary.error },
        { status: primary.status },
      );
    }

    let siblingCancelled: string | null = null;
    if (evaluationId) {
      const sibling = pairedSiblingRunId(runId, evaluationId, role);
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
