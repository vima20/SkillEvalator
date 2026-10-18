import fs from "node:fs";
import {
  assertSafeId,
  hasLiveJobFile,
  loadRunResult,
  loadRunStatus,
  resolvePairedCancelSibling,
} from "@skillevalator/core";
import {
  loadEvaluationMeta,
  resolveHealedMetaLegsForCancel,
} from "@/lib/evaluations";
import { jobsDir, resultsDir } from "@/lib/paths";
import { resolveListRunEvaluationId } from "@/lib/runDetailEvaluationPack";
import { pairedCancelPeerStatuses } from "@/lib/runLifecycle";

/** Status fields written on cancel / cancel_requested for Comparison pairing. */
export function cancelPairingMeta(opts: {
  role?: string;
  evaluationId?: string | null;
}): { role?: string; evaluationId?: string } {
  return {
    ...(opts.role ? { role: opts.role } : {}),
    ...(opts.evaluationId ? { evaluationId: opts.evaluationId } : {}),
  };
}

/**
 * Sibling baseline/candidate for the same Comparison, if any.
 * Peer match uses status → job → result evaluationId (not status-only).
 */
export function findPairedCancelSiblingRunId(opts: {
  runId: string;
  evaluationId: string;
  role?: string;
  resultsRoot?: string;
  /** Injected peer evaluationId resolver (skip disk). */
  resolvePeerEvaluationId?: (peerRunId: string) => string | null;
  /** Injected tip-healed meta legs (skip disk). */
  loadMeta?: (
    evaluationId: string,
  ) => ReturnType<typeof resolveHealedMetaLegsForCancel>;
}): string | null {
  const root = opts.resultsRoot ?? resultsDir();
  const meta = (opts.loadMeta ?? resolveHealedMetaLegsForCancel)(
    opts.evaluationId,
  );

  // During in-flight retry tip-link, healed meta may expose the parent while
  // disk tip is still the ghost/live child — cascade must target disk tip.
  const disk = loadEvaluationMeta(opts.evaluationId);
  if (
    disk &&
    (opts.role === "baseline" || opts.role === "candidate")
  ) {
    const opposite = opts.role === "baseline" ? "candidate" : "baseline";
    const diskTip =
      opposite === "baseline" ? disk.baselineRunId : disk.candidateRunId;
    const healedTip = meta
      ? opposite === "baseline"
        ? meta.baselineRunId
        : meta.candidateRunId
      : null;
    if (diskTip && diskTip !== opts.runId && diskTip !== healedTip) {
      try {
        assertSafeId(diskTip, "runId");
        const st = loadRunStatus(root, diskTip);
        const cancellable = pairedCancelPeerStatuses();
        if (
          hasLiveJobFile(jobsDir(), diskTip) ||
          (st && cancellable.has(st.status ?? ""))
        ) {
          return diskTip;
        }
        // Ghost tip (linked before enqueue): no status/result/job yet.
        if (!st && !loadRunResult(root, diskTip)) {
          return diskTip;
        }
      } catch {
        /* ignore invalid tip */
      }
    }
  }

  const resolvePeer =
    opts.resolvePeerEvaluationId ??
    ((name: string) =>
      resolveListRunEvaluationId({
        runId: name,
        result: loadRunResult(root, name),
        resultsRoot: root,
      }));

  const peers: Array<{ runId: string; role?: string; status?: string }> = [];
  try {
    for (const name of fs.readdirSync(root)) {
      if (name === opts.runId || name.startsWith("eval_")) continue;
      try {
        assertSafeId(name, "runId");
      } catch {
        continue;
      }
      if (resolvePeer(name) !== opts.evaluationId) continue;
      const st = loadRunStatus(root, name);
      peers.push({
        runId: name,
        role: st?.role,
        status: st?.status,
      });
    }
  } catch {
    /* ignore */
  }

  return resolvePairedCancelSibling({
    runId: opts.runId,
    role: opts.role,
    meta,
    peers,
    // Include budget_stop so a wind-down peer can be cascade-cancelled;
    // requestCancelOne still rejects settled budget_stop (has result.json).
    cancellableStatuses: pairedCancelPeerStatuses(),
  });
}
