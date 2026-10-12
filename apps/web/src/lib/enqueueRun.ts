import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertSafeId,
  createJobManifest,
  isQueuedJobFile,
  resolveUnder,
  writeJsonFile,
  type JobManifest,
} from "@skillevalator/core";
import { jobsDir, resultsDir, skillsDirs } from "@/lib/paths";

function skillExists(evalSkillId: string): boolean {
  for (const dir of skillsDirs()) {
    try {
      if (fs.existsSync(resolveUnder(dir, evalSkillId))) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

const MAX_QUEUED_JOBS = 20;

export type EnqueueInput = {
  evalSkillId: string;
  mode: JobManifest["mode"];
  repeats?: number;
  modelId?: string;
  role?: JobManifest["role"];
  evaluationId?: string;
  /** Retry: lock candidate SKILL.md to this prior run's skill-snapshot. */
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

function queueSlotsNeeded(n: number): EnqueueResult | null {
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

export function enqueueRun(input: EnqueueInput): EnqueueResult {
  const evalSkillId = assertSafeId(input.evalSkillId, "evalSkillId");
  if (!skillExists(evalSkillId)) {
    return { ok: false, status: 400, error: "unknown skill" };
  }

  const full = queueSlotsNeeded(1);
  if (full) return full;

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
  if (!skillExists(evalSkillId)) {
    return { ok: false, status: 400, error: "unknown skill" };
  }

  const full = queueSlotsNeeded(2);
  if (full) return full;

  const evaluationId = `eval_${Date.now()}_${randomUUID().slice(0, 8)}`;

  const baseline = enqueueRun({
    ...input,
    evalSkillId,
    role: "baseline",
    evaluationId,
  });
  if (!baseline.ok) return baseline;

  // Tiny delay so runIds stay unique under Date.now() collisions.
  const candidate = enqueueRun({
    ...input,
    evalSkillId,
    role: "candidate",
    evaluationId,
  });
  if (!candidate.ok) {
    // Roll back the baseline leg so Comparison is not left half-queued.
    abortQueuedRun(baseline.runId, candidate.error);
    return {
      ok: false,
      status: candidate.status,
      error: `candidate enqueue failed after baseline ${baseline.runId}: ${candidate.error}`,
    };
  }

  writeJsonFile(path.join(resultsDir(), evaluationId, "evaluation.json"), {
    evaluationId,
    evalSkillId,
    mode: input.mode,
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
    createdAt: new Date().toISOString(),
  });

  return {
    ok: true,
    evaluationId,
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
  };
}

/** Remove a just-queued job and mark its status failed (paired enqueue abort). */
function abortQueuedRun(runId: string, reason: string): void {
  const jobs = jobsDir();
  for (const name of [`${runId}.json`, `${runId}.tmp.json`]) {
    try {
      fs.unlinkSync(path.join(jobs, name));
    } catch {
      /* ignore */
    }
  }
  try {
    writeJsonFile(path.join(resultsDir(), runId, "status.json"), {
      runId,
      status: "failed",
      error: `Paired enqueue aborted: ${reason}`.slice(0, 800),
      errorCode: "paired_enqueue_aborted",
    });
  } catch {
    /* ignore */
  }
}
