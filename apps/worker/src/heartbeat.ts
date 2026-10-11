import path from "node:path";
import { writeJsonFile } from "@skillevalator/core";
import { config } from "./config.js";

export type WorkerHeartbeat = {
  pid: number;
  at: string;
  busy?: boolean;
  runId?: string;
};

/** Soft liveness signal for web preflight (pid + timestamp). */
export function touchHeartbeat(extra?: {
  busy?: boolean;
  runId?: string;
}): void {
  try {
    const payload: WorkerHeartbeat = {
      pid: process.pid,
      at: new Date().toISOString(),
      ...(extra?.busy ? { busy: true } : {}),
      ...(extra?.runId ? { runId: extra.runId } : {}),
    };
    writeJsonFile(path.join(config.jobsDir, ".worker"), payload);
  } catch {
    /* ignore */
  }
}
