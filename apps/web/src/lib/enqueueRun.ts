import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertSafeId,
  createJobManifest,
  isQueuedJobFile,
  loadSkill,
  releaseWxLock,
  tryAcquireWxLock,
  writeJsonFile,
  type JobManifest,
} from "@skillevalator/core";
import { jobsDir, resultsDir, skillsDirs } from "@/lib/paths";

/** Reject broken / incomplete imports before they hit the worker queue. */
function skillReady(
  evalSkillId: string,
): { ok: true } | { ok: false; error: string } {
  try {
    loadSkill(skillsDirs(), evalSkillId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message.startsWith("Skill not found")
        ? "unknown skill"
        : `skill not ready: ${message}`.slice(0, 400),
    };
  }
}

const MAX_QUEUED_JOBS = 20;
/** Serialize slot check + job write so concurrent POSTs cannot overrun the cap. */
const ENQUEUE_LOCK_STALE_MS = 30_000;

export type EnqueueInput = {
  evalSkillId: string;
  mode: JobManifest["mode"];
  repeats?: number;
  modelId?: string;
  role?: JobManifest["role"];
  evaluationId?: string;
  /** Retry: pin evalSkillVersion (+ candidate SKILL.md) to prior skill-snapshot. */
  skillSnapshotFromRunId?: string;
};

export type EnqueueResult =
  | { ok: true; runId: string }
  | { ok: false; status: number; error: string };

export type EnqueuePairResult =
  | {
      ok: true;
      evaluationId: string;
      baselineRunId: string;
      candidateRunId: string;
    }
  | { ok: false; status: number; error: string };

function queueSlotsNeeded(
  n: number,
): { ok: false; status: number; error: string } | null {
  const dir = jobsDir();
  fs.mkdirSync(dir, { recursive: true });
  const queuedCount = fs.readdirSync(dir).filter(isQueuedJobFile).length;
  if (queuedCount + n > MAX_QUEUED_JOBS) {
    return {
      ok: false,
      status: 429,
      error: `queue full (max ${MAX_QUEUED_JOBS} pending jobs)`,
    };
  }
  return null;
}

type EnqueueLockBusy = { ok: false; status: 503; error: string };

function withEnqueueLock<T>(fn: () => T): T | EnqueueLockBusy {
  const dir = jobsDir();
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, ".enqueue.lock");
  if (!tryAcquireWxLock(lockPath, { staleMs: ENQUEUE_LOCK_STALE_MS, retries: 80 })) {
    return {
      ok: false,
      status: 503,
      error: "enqueue lock busy; retry shortly",
    };
  }
  try {
    return fn();
  } finally {
    releaseWxLock(lockPath);
  }
}

/** Caller must hold `.enqueue.lock` (and have already reserved slots). */
function writeQueuedRun(input: EnqueueInput): EnqueueResult {
  const evalSkillId = assertSafeId(input.evalSkillId, "evalSkillId");
  const evaluationId = input.evaluationId
    ? assertSafeId(input.evaluationId, "evaluationId")
    : undefined;
  const skillSnapshotFromRunId = input.skillSnapshotFromRunId
    ? assertSafeId(input.skillSnapshotFromRunId, "skillSnapshotFromRunId")
    : undefined;
  const role = input.role ?? "candidate";

  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const job = createJobManifest({
    runId,
    evalSkillId,
    mode: input.mode,
    repeats: input.repeats,
    modelId: input.modelId,
    role,
    evaluationId,
    skillSnapshotFromRunId,
  });

  // status.json first so listRuns can see the run; if we crash before the
  // job file lands, orphan-queued heal marks it failed (no ghost job).
  writeJsonFile(path.join(resultsDir(), runId, "status.json"), {
    runId,
    status: "queued",
    role,
    ...(evaluationId ? { evaluationId } : {}),
  });

  const dir = jobsDir();
  const tmp = path.join(dir, `${runId}.tmp.json`);
  const final = path.join(dir, `${runId}.json`);
  writeJsonFile(tmp, job);
  fs.renameSync(tmp, final);

  return { ok: true, runId };
}

export function enqueueRun(input: EnqueueInput): EnqueueResult {
  const evalSkillId = assertSafeId(input.evalSkillId, "evalSkillId");
  const ready = skillReady(evalSkillId);
  if (!ready.ok) {
    return { ok: false, status: 400, error: ready.error };
  }

  return withEnqueueLock(() => {
    const full = queueSlotsNeeded(1);
    if (full) return full;
    return writeQueuedRun({ ...input, evalSkillId });
  });
}

/**
 * Unikie paired evaluation: baseline (neutral prompt) + candidate (SKILL.md)
 * share one evaluationId for Comparison view.
 */
export function enqueueEvaluationPair(input: {
  evalSkillId: string;
  mode: JobManifest["mode"];
  repeats?: number;
  modelId?: string;
}): EnqueuePairResult {
  const evalSkillId = assertSafeId(input.evalSkillId, "evalSkillId");
  const ready = skillReady(evalSkillId);
  if (!ready.ok) {
    return { ok: false, status: 400, error: ready.error };
  }

  const locked = withEnqueueLock((): EnqueuePairResult => {
    const full = queueSlotsNeeded(2);
    if (full) return full;

    const evaluationId = `eval_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const baseline = writeQueuedRun({
      ...input,
      evalSkillId,
      role: "baseline",
      evaluationId,
    });
    if (!baseline.ok) return baseline;

    // Tiny delay so runIds stay unique under Date.now() collisions.
    const candidate = writeQueuedRun({
      ...input,
      evalSkillId,
      role: "candidate",
      evaluationId,
    });
    if (!candidate.ok) {
      // Roll back the baseline leg so Comparison is not left half-queued.
      abortQueuedRun(baseline.runId, candidate.error, {
        role: "baseline",
      });
      return {
        ok: false,
        status: candidate.status,
        error: `candidate enqueue failed after baseline ${baseline.runId}: ${candidate.error}`,
      };
    }

    try {
      writeJsonFile(path.join(resultsDir(), evaluationId, "evaluation.json"), {
        evaluationId,
        evalSkillId,
        mode: input.mode,
        baselineRunId: baseline.runId,
        candidateRunId: candidate.runId,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      abortQueuedRun(baseline.runId, `evaluation.json write failed: ${message}`, {
        role: "baseline",
      });
      abortQueuedRun(
        candidate.runId,
        `evaluation.json write failed: ${message}`,
        { role: "candidate" },
      );
      return {
        ok: false,
        status: 500,
        error: `failed to write evaluation.json: ${message}`.slice(0, 400),
      };
    }

    return {
      ok: true,
      evaluationId,
      baselineRunId: baseline.runId,
      candidateRunId: candidate.runId,
    };
  });

  return locked;
}

/**
 * Abort a just-queued (or already-claimed) run when a follow-up step fails
 * (paired candidate enqueue, Comparison meta link after retry, etc.).
 * Writes .cancel so a running worker stops; removes queued job files when possible.
 * If the worker already claimed `.running.json`, only `.cancel` is written —
 * do not stamp `failed` (worker owns finalization and cancel wins).
 */
export function abortQueuedRun(
  runId: string,
  reason: string,
  meta?: { role?: "baseline" | "candidate"; evaluationId?: string },
): void {
  const jobs = jobsDir();
  const cancelPath = path.join(jobs, `${runId}.cancel`);
  try {
    fs.writeFileSync(cancelPath, `${new Date().toISOString()}\n`, "utf8");
  } catch {
    /* ignore */
  }
  // Only remove queued/tmp — never rename .running.json (worker finalizes it).
  for (const name of [`${runId}.json`, `${runId}.tmp.json`]) {
    try {
      fs.unlinkSync(path.join(jobs, name));
    } catch {
      /* ignore */
    }
  }
  const claimed = fs.existsSync(path.join(jobs, `${runId}.running.json`));
  if (claimed) {
    // Worker will observe .cancel and finalize; avoid racing status.json.
    return;
  }
  try {
    const statusPath = path.join(resultsDir(), runId, "status.json");
    let prior: Record<string, unknown> = {};
    try {
      if (fs.existsSync(statusPath)) {
        prior = JSON.parse(fs.readFileSync(statusPath, "utf8")) as Record<
          string,
          unknown
        >;
      }
    } catch {
      prior = {};
    }
    // Pair-enqueue abort (no evaluation.json yet): drop evaluationId so
    // Comparison does not 404. Retry abort: keep meta.evaluationId when passed.
    const { evaluationId: _priorEval, ...priorRest } = prior;
    const keepEvalId = meta?.evaluationId
      ? assertSafeId(meta.evaluationId, "evaluationId")
      : undefined;
    writeJsonFile(statusPath, {
      ...priorRest,
      runId,
      status: "failed",
      error: `Paired enqueue aborted: ${reason}`.slice(0, 800),
      errorCode: "paired_enqueue_aborted",
      ...(meta?.role ? { role: meta.role } : {}),
      ...(keepEvalId ? { evaluationId: keepEvalId } : {}),
    });
  } catch {
    /* ignore */
  }
}
