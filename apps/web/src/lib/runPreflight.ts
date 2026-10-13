import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  findRepoRoot,
  isWorkerHeartbeatLive,
  WORKER_HEARTBEAT_BUSY_STALE_MS,
  WORKER_HEARTBEAT_IDLE_STALE_MS,
} from "@skillevalator/core";
import { jobsDir, repoRoot } from "@/lib/paths";

export type PreflightCheck = {
  ok: boolean;
  detail: string;
};

export type RunPreflightResult = {
  ok: boolean;
  fakeProduce: boolean;
  costCapUsd: number;
  checks: {
    openaiApiKey: PreflightCheck;
    docker: PreflightCheck;
    worker: PreflightCheck;
  };
  checkedAt: string;
};

/** Load root `.env` into process.env without overwriting non-empty values. */
export function applyRootEnv(root: string): void {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined && process.env[key] !== "") continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

export function checkDocker(): PreflightCheck {
  try {
    const r = spawnSync("docker", ["info"], {
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    if (r.error) {
      return { ok: false, detail: r.error.message };
    }
    if (r.status === 0) {
      return { ok: true, detail: "Docker daemon reachable" };
    }
    const err = (r.stderr || r.stdout || `exit ${r.status}`).trim();
    return {
      ok: false,
      detail: err.slice(0, 160) || `docker info failed (${r.status})`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "docker check failed",
    };
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Worker liveness with the same windows as core orphan/retry heal. */
export function checkWorker(dir: string): PreflightCheck {
  const hb = path.join(dir, ".worker");
  if (!fs.existsSync(hb)) {
    return {
      ok: false,
      detail: "No worker heartbeat — start with npm run dev / start.bat",
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(hb, "utf8")) as {
      pid?: number;
      at?: string;
      busy?: boolean;
      runId?: string;
    };
    const pid = Number(raw.pid);
    const live = isWorkerHeartbeatLive(dir, {
      isPidAlive,
      idleStaleMs: WORKER_HEARTBEAT_IDLE_STALE_MS,
      busyStaleMs: WORKER_HEARTBEAT_BUSY_STALE_MS,
    });
    if (!live) {
      if (!isPidAlive(pid)) {
        return {
          ok: false,
          detail: "Worker heartbeat PID is dead — restart the worker",
        };
      }
      return {
        ok: false,
        detail: "Worker heartbeat is stale — restart the worker",
      };
    }
    if (raw.busy && raw.runId) {
      return {
        ok: true,
        detail: `Worker busy on ${raw.runId} (pid ${pid})`,
      };
    }
    return { ok: true, detail: `Worker alive (pid ${pid})` };
  } catch {
    return { ok: false, detail: "Worker heartbeat file unreadable" };
  }
}

export function checkOpenAiApiKey(
  env: Record<string, string | undefined> = process.env,
): {
  check: PreflightCheck;
  fakeProduce: boolean;
} {
  const fakeProduce = env.FAKE_PRODUCE === "known-good";
  const keySet = Boolean(env.OPENAI_API_KEY?.trim());
  if (fakeProduce) {
    return {
      fakeProduce: true,
      check: {
        ok: true,
        detail: "FAKE_PRODUCE=known-good — API key not required for smoke",
      },
    };
  }
  if (keySet) {
    return {
      fakeProduce: false,
      check: { ok: true, detail: "OPENAI_API_KEY is set" },
    };
  }
  return {
    fakeProduce: false,
    check: {
      ok: false,
      detail: "OPENAI_API_KEY missing in .env (needed for live produce)",
    },
  };
}

/**
 * Shared preflight for GET /api/preflight and enqueue gates (POST /api/runs).
 * Fail-closed: worker + Docker + (API key or FAKE_PRODUCE smoke).
 */
export function runPreflight(opts?: {
  jobsDir?: string;
  repoRoot?: string;
  /** Injected checks for unit tests (skip docker spawn). */
  docker?: PreflightCheck;
  worker?: PreflightCheck;
  env?: Record<string, string | undefined>;
}): RunPreflightResult {
  const root =
    opts?.repoRoot ?? (repoRoot() || findRepoRoot(process.cwd()));
  applyRootEnv(root);

  const { check: openaiApiKey, fakeProduce } = checkOpenAiApiKey(
    opts?.env ?? process.env,
  );
  const docker = opts?.docker ?? checkDocker();
  const worker = opts?.worker ?? checkWorker(opts?.jobsDir ?? jobsDir());

  const checks = { openaiApiKey, docker, worker };
  const ok = openaiApiKey.ok && docker.ok && worker.ok;

  const capRaw = Number((opts?.env ?? process.env).COST_CAP_USD);
  const costCapUsd = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 5;

  return {
    ok,
    fakeProduce,
    costCapUsd,
    checks,
    checkedAt: new Date().toISOString(),
  };
}
