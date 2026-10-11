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
import { jobsDir, resultsDir, skillsDir } from "@/lib/paths";

const MAX_QUEUED_JOBS = 20;

export type EnqueueInput = {
  evalSkillId: string;
  mode: JobManifest["mode"];
  repeats?: number;
  modelId?: string;
};

export type EnqueueResult =
  | { ok: true; runId: string }
  | { ok: false; status: number; error: string };

export function enqueueRun(input: EnqueueInput): EnqueueResult {
  const evalSkillId = assertSafeId(input.evalSkillId, "evalSkillId");
  const skillPath = resolveUnder(skillsDir(), evalSkillId);
  if (!fs.existsSync(skillPath)) {
    return { ok: false, status: 400, error: "unknown skill" };
  }

  const dir = jobsDir();
  fs.mkdirSync(dir, { recursive: true });
  const queuedCount = fs.readdirSync(dir).filter(isQueuedJobFile).length;
  if (queuedCount >= MAX_QUEUED_JOBS) {
    return {
      ok: false,
      status: 429,
      error: `queue full (max ${MAX_QUEUED_JOBS} pending jobs)`,
    };
  }

  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const job = createJobManifest({
    runId,
    evalSkillId,
    mode: input.mode,
    repeats: input.repeats,
    modelId: input.modelId,
  });

  const tmp = path.join(dir, `${runId}.tmp.json`);
  const final = path.join(dir, `${runId}.json`);
  writeJsonFile(tmp, job);
  fs.renameSync(tmp, final);

  writeJsonFile(path.join(resultsDir(), runId, "status.json"), {
    runId,
    status: "queued",
  });

  return { ok: true, runId };
}
