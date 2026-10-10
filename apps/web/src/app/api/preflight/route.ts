import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { findRepoRoot } from "@skillevalator/core";
import { jobsDir, repoRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

type Check = {
  ok: boolean;
  detail: string;
};

function applyRootEnv(root: string): void {
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

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkDocker(): Check {
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

function checkWorker(dir: string): Check {
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
    };
    const pid = Number(raw.pid);
    const at = raw.at ? Date.parse(raw.at) : NaN;
    if (!isPidAlive(pid)) {
      return {
        ok: false,
        detail: "Worker heartbeat PID is dead — restart the worker",
      };
    }
    if (!Number.isFinite(at) || Date.now() - at > 15_000) {
      return {
        ok: false,
        detail: "Worker heartbeat is stale — restart the worker",
      };
    }
    return { ok: true, detail: `Worker alive (pid ${pid})` };
  } catch {
    return { ok: false, detail: "Worker heartbeat file unreadable" };
  }
}

export async function GET() {
  const root = repoRoot() || findRepoRoot(process.cwd());
  applyRootEnv(root);

  const fakeProduce = process.env.FAKE_PRODUCE === "known-good";
  const keySet = Boolean(process.env.OPENAI_API_KEY?.trim());
  const openaiApiKey: Check = fakeProduce
    ? {
        ok: true,
        detail: "FAKE_PRODUCE=known-good — API key not required for smoke",
      }
    : keySet
      ? { ok: true, detail: "OPENAI_API_KEY is set" }
      : {
          ok: false,
          detail: "OPENAI_API_KEY missing in .env (needed for live produce)",
        };

  const docker = checkDocker();
  const worker = checkWorker(jobsDir());

  const checks = { openaiApiKey, docker, worker };
  const ok = openaiApiKey.ok && docker.ok && worker.ok;

  return NextResponse.json({
    ok,
    fakeProduce,
    checks,
    checkedAt: new Date().toISOString(),
  });
}
