import fs from "node:fs";
import path from "node:path";
import {
  assertSafeId,
  clearRetryMarker,
  findRetryParentRunId,
  loadRunResult,
  loadRunStatus,
  syncStatusFromResult,
  writeJsonFile,
} from "@skillevalator/core";
import {
  cancelPairingMeta,
  findPairedCancelSiblingRunId,
} from "@/lib/cancelPairedSibling";
import { abortQueuedRun } from "@/lib/enqueueRun";
import {
  loadEvaluationMeta,
  updateEvaluationMetaLeg,
} from "@/lib/evaluations";
import { healRunForRead } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { resolveRunDetailEvaluationId } from "@/lib/runDetailEvaluationPack";
import {
  CANCEL_NOT_FOUND_ERROR,
  cancelGate,
  type CancelErrorCode,
} from "@/lib/runLifecycle";

export type CancelOutcome =
  | { ok: true; status: "cancelled" | "cancel_requested"; already?: boolean }
  | {
      ok: false;
      status: number;
      error: string;
      errorCode: CancelErrorCode;
    };

export type CancelRunResult =
  | {
      ok: true;
      runId: string;
      already: boolean;
      status: "cancelled" | "cancel_requested";
      alsoCancelled?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      errorCode: CancelErrorCode;
    };

/** Cancel one run: .cancel marker, queued→cancelled or cancel_requested. */
export function requestCancelOne(
  runId: string,
  pairing?: { role?: string; evaluationId?: string | null },
): CancelOutcome {
  const root = resultsDir();
  const status = loadRunStatus(root, runId);
  if (!status) {
    return {
      ok: false,
      status: 404,
      error: CANCEL_NOT_FOUND_ERROR,
      errorCode: "cancel_not_found",
    };
  }

  const current = status.status ?? "unknown";
  const hasResult = fs.existsSync(path.join(root, runId, "result.json"));
  const gate = cancelGate(current, hasResult);
  if (!gate.allow) {
    return {
      ok: false,
      status: 409,
      error: gate.error,
      errorCode: gate.errorCode,
    };
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
 * Abort a Comparison tip that was linked before enqueue (no status/result yet):
 * revert tip to retry-of parent, clear marker, and soft-abort the ghost id.
 */
export function abortGhostPairedTip(opts: {
  evaluationId: string;
  ghostRunId: string;
}): boolean {
  const evaluationId = assertSafeId(opts.evaluationId, "evaluationId");
  const ghostRunId = assertSafeId(opts.ghostRunId, "runId");
  const disk = loadEvaluationMeta(evaluationId);
  if (!disk) return false;
  const role: "baseline" | "candidate" | null =
    disk.baselineRunId === ghostRunId
      ? "baseline"
      : disk.candidateRunId === ghostRunId
        ? "candidate"
        : null;
  if (!role) return false;

  const parent = findRetryParentRunId(resultsDir(), ghostRunId);
  if (parent) {
    updateEvaluationMetaLeg({
      evaluationId,
      role,
      runId: parent,
      ...(disk.mode === "dry-run" || disk.mode === "official"
        ? { mode: disk.mode }
        : {}),
      evalSkillId: disk.evalSkillId,
    });
    clearRetryMarker(resultsDir(), parent);
  }
  abortQueuedRun(ghostRunId, "paired cancel aborted ghost tip", {
    role,
    evaluationId,
  });
  return true;
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
    return {
      ok: false,
      status: primary.status,
      error: primary.error,
      errorCode: primary.errorCode,
    };
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
      // Ghost tip (retry linked before enqueue): no status → requestCancelOne 404.
      if (
        !loadRunStatus(root, safeSibling) &&
        !loadRunResult(root, safeSibling)
      ) {
        if (abortGhostPairedTip({ evaluationId, ghostRunId: safeSibling })) {
          alsoCancelled = safeSibling;
        }
      } else {
        const sib = requestCancelOne(safeSibling, { evaluationId });
        if (sib.ok && !sib.already) alsoCancelled = safeSibling;
      }
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
