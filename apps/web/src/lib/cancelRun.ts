import fs from "node:fs";
import path from "node:path";
import {
  assertSafeId,
  loadRunResult,
  loadRunStatus,
  syncStatusFromResult,
  writeJsonFile,
} from "@skillevalator/core";
import {
  cancelPairingMeta,
  findPairedCancelSiblingRunId,
} from "@/lib/cancelPairedSibling";
import { healRunForRead } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { resolveRunDetailEvaluationId } from "@/lib/runDetailEvaluationPack";
import { cancelGate } from "@/lib/runLifecycle";

export type CancelOutcome =
  | { ok: true; status: "cancelled" | "cancel_requested"; already?: boolean }
  | { ok: false; status: number; error: string };

export type CancelRunResult =
  | {
      ok: true;
      runId: string;
      already: boolean;
      status: "cancelled" | "cancel_requested";
      alsoCancelled?: string;
    }
  | { ok: false; status: number; error: string };

/** Cancel one run: .cancel marker, queued→cancelled or cancel_requested. */
export function requestCancelOne(
  runId: string,
  pairing?: { role?: string; evaluationId?: string | null },
): CancelOutcome {
  const root = resultsDir();
  const status = loadRunStatus(root, runId);
  if (!status) {
    return { ok: false, status: 404, error: "not found" };
  }

  const current = status.status ?? "unknown";
  const hasResult = fs.existsSync(path.join(root, runId, "result.json"));
  const gate = cancelGate(current, hasResult);
  if (!gate.allow) {
    return { ok: false, status: 409, error: gate.error };
  }
  if (gate.alreadyCancelled) {
    return { ok: true, status: "cancelled", already: true };
  }

  const dir = jobsDir();
  fs.mkdirSync(dir, { recursive: true });
  // Always (re)write .cancel so a lost marker still stops the worker.
  const cancelPath = path.join(dir, `${runId}.cancel`);
  fs.writeFileSync(cancelPath, `${new Date().toISOString()}\n`, "utf8");

  if (current === "cancel_requested") {
    return { ok: true, status: "cancel_requested", already: true };
  }

  const pairingMeta = cancelPairingMeta({
    role: pairing?.role ?? status.role,
    evaluationId: pairing?.evaluationId ?? status.evaluationId,
  });

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

/**
 * POST /cancel orchestration: heal → resolve evaluationId → primary →
 * paired sibling cascade (`alsoCancelled`).
 */
export function cancelRunWithCascade(rawRunId: string): CancelRunResult {
  const runId = assertSafeId(rawRunId, "runId");
  const root = resultsDir();
  // Same read-path heal as GET/SSR — reclaim only, keep wind-down Cancel.
  healRunForRead(runId);
  const result = loadRunResult(root, runId);
  const prior = syncStatusFromResult(root, runId) ?? loadRunStatus(root, runId);
  // Same status → job → result order as run detail / retry / CSV.
  const evaluationId = resolveRunDetailEvaluationId({
    runId,
    status: prior,
    result,
  });
  const role =
    typeof prior?.role === "string"
      ? prior.role
      : result?.role === "baseline" || result?.role === "candidate"
        ? result.role
        : undefined;

  const primary = requestCancelOne(runId, { evaluationId, role });
  if (!primary.ok) {
    return { ok: false, status: primary.status, error: primary.error };
  }

  let alsoCancelled: string | undefined;
  if (evaluationId) {
    const sibling = findPairedCancelSiblingRunId({
      runId,
      evaluationId,
      role,
    });
    if (sibling && sibling !== runId) {
      const safeSibling = assertSafeId(sibling, "runId");
      healRunForRead(safeSibling);
      const sib = requestCancelOne(safeSibling, { evaluationId });
      if (sib.ok && !sib.already) alsoCancelled = safeSibling;
    }
  }

  return {
    ok: true,
    runId,
    already: primary.already === true,
    status: primary.status,
    ...(alsoCancelled ? { alsoCancelled } : {}),
  };
}
