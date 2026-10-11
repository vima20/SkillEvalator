import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export type GradeResult = {
  exitCode: number;
  summary: string;
};

/**
 * Host path for Docker Desktop bind mounts.
 * Windows `C:\foo` → `/c/foo` (also accepts already-posix paths).
 */
export function toDockerBindPath(hostPath: string): string {
  const resolved = path.resolve(hostPath);
  const forward = resolved.replace(/\\/g, "/");
  const drive = /^([A-Za-z]):\/(.*)$/.exec(forward);
  if (drive) {
    return `/${drive[1]!.toLowerCase()}/${drive[2]!}`;
  }
  return forward;
}

function withTempDir<T>(prefix: string, fn: (work: string) => T): T {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(work);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function withTempDirAsync<T>(
  prefix: string,
  fn: (work: string) => Promise<T>,
): Promise<T> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await fn(work);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Copy regular files only; reject symlinks (grade integrity). */
function copyDirFiles(srcDir: string, destDir: string): number {
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(destDir, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const st = fs.lstatSync(src);
    if (st.isSymbolicLink()) {
      throw new Error(`symlink not allowed: ${name}`);
    }
    if (st.isFile()) {
      fs.copyFileSync(src, path.join(destDir, name));
      n += 1;
    }
  }
  return n;
}

/**
 * Stage only non-secret task assets for grading:
 * - tests/ (code-debugging-eval)
 * - subject/ + optional subject-bad/ (test-generation-eval)
 * Never copies expected/, known-good/, known-bad/, or input/.
 */
function stageTaskForGrade(taskDir: string, destTaskDir: string): void {
  const testsCopied = copyDirFiles(
    path.join(taskDir, "tests"),
    path.join(destTaskDir, "tests"),
  );
  const subjectCopied = copyDirFiles(
    path.join(taskDir, "subject"),
    path.join(destTaskDir, "subject"),
  );
  copyDirFiles(
    path.join(taskDir, "subject-bad"),
    path.join(destTaskDir, "subject-bad"),
  );
  if (testsCopied === 0 && subjectCopied === 0) {
    throw new Error("tests/ or subject/ required for grading");
  }
}

function killContainer(containerName: string): void {
  spawnSync("docker", ["rm", "-f", containerName], {
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
}

/** Pure helper for mid-grade abort reason (unit-tested). */
export function decideDockerGradeAbort(opts: {
  cancelRequested: boolean;
  timedOut: boolean;
}): "cancel" | "timeout" | null {
  if (opts.cancelRequested) return "cancel";
  if (opts.timedOut) return "timeout";
  return null;
}

/**
 * Grade artifact in Docker: node image, no network.
 * When cancelPath appears, force-removes the container mid-grade.
 */
export async function gradeInDocker(opts: {
  skillRoot: string;
  taskDir: string;
  targetFile: string;
  artifactPath: string;
  image?: string;
  timeoutMs?: number;
  /** If this file appears, kill the grade container immediately. */
  cancelPath?: string;
}): Promise<GradeResult> {
  const image = opts.image ?? "node:22-bookworm-slim";
  const timeoutMs = opts.timeoutMs ?? 60_000;
  if (!fs.existsSync(opts.artifactPath)) {
    return { exitCode: 1, summary: "artifact missing" };
  }

  return withTempDirAsync("cde-docker-", async (work) => {
    const artifactDir = path.join(work, "artifact");
    const taskStage = path.join(work, "task");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.copyFileSync(opts.artifactPath, path.join(artifactDir, "artifact.js"));
    try {
      stageTaskForGrade(opts.taskDir, taskStage);
    } catch (e) {
      return {
        exitCode: 1,
        summary: e instanceof Error ? e.message : "stage failed",
      };
    }

    const scriptsDir = path.join(opts.skillRoot, "scripts");
    if (!fs.existsSync(path.join(scriptsDir, "grade.js"))) {
      return { exitCode: 1, summary: "grade.js missing" };
    }

    const containerName = `se-grade-${crypto.randomBytes(6).toString("hex")}`;

    const args = [
      "run",
      "--name",
      containerName,
      "--rm",
      "--network",
      "none",
      "--memory",
      "256m",
      "--pids-limit",
      "128",
      "--user",
      "65534:65534",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "-v",
      `${toDockerBindPath(scriptsDir)}:/skill/scripts:ro`,
      "-v",
      `${toDockerBindPath(taskStage)}:/task:ro`,
      "-v",
      `${toDockerBindPath(artifactDir)}:/work:ro`,
      "-e",
      "TASK_DIR=/task",
      "-e",
      `TARGET_FILE=${opts.targetFile}`,
      "-e",
      "ARTIFACT_PATH=/work/artifact.js",
      image,
      "node",
      "/skill/scripts/grade.js",
    ];

    return await new Promise<GradeResult>((resolve) => {
      let settled = false;
      let cancelled = false;
      let timedOut = false;
      let stdout = "";
      let stderr = "";

      const child = spawn("docker", args, {
        windowsHide: true,
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      const finish = (result: GradeResult) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        clearTimeout(timer);
        killContainer(containerName);
        resolve(result);
      };

      const poll = setInterval(() => {
        if (opts.cancelPath && fs.existsSync(opts.cancelPath)) {
          cancelled = true;
          try {
            child.kill("SIGTERM");
          } catch {
            /* ignore */
          }
          killContainer(containerName);
        }
      }, 400);

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        killContainer(containerName);
      }, timeoutMs);

      child.on("error", (err) => {
        finish({ exitCode: 1, summary: `docker error: ${err.message}` });
      });

      child.on("close", (code) => {
        const abort = decideDockerGradeAbort({
          cancelRequested: cancelled,
          timedOut,
        });
        if (abort === "cancel") {
          finish({
            exitCode: 1,
            summary: "cancelled during docker grade",
          });
          return;
        }
        if (abort === "timeout") {
          finish({ exitCode: 1, summary: "docker grade timeout" });
          return;
        }
        const summary = [stdout, stderr]
          .filter(Boolean)
          .join("\n")
          .slice(0, 2000);
        finish({
          exitCode: code ?? 1,
          summary: summary || `exit ${code}`,
        });
      });
    });
  });
}

/**
 * Host-side grade for smoke only. Caller must gate with FAKE_PRODUCE=known-good.
 */
export function gradeOnHost(opts: {
  skillRoot: string;
  taskDir: string;
  targetFile: string;
  artifactPath: string;
}): GradeResult {
  const gradeJs = path.join(opts.skillRoot, "scripts", "grade.js");
  if (!fs.existsSync(gradeJs)) {
    return { exitCode: 1, summary: "grade.js missing" };
  }
  if (!fs.existsSync(opts.artifactPath)) {
    return { exitCode: 1, summary: "artifact missing" };
  }

  return withTempDir("cde-host-", (work) => {
    try {
      stageTaskForGrade(opts.taskDir, work);
    } catch (e) {
      return {
        exitCode: 1,
        summary: e instanceof Error ? e.message : "stage failed",
      };
    }

    const r = spawnSync(process.execPath, [gradeJs], {
      encoding: "utf8",
      timeout: 20_000,
      env: {
        PATH: process.env.PATH ?? "",
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
        TASK_DIR: work,
        TARGET_FILE: opts.targetFile,
        ARTIFACT_PATH: opts.artifactPath,
      },
    });
    const summary = [r.stdout, r.stderr].filter(Boolean).join("\n").slice(0, 2000);
    return { exitCode: r.status ?? 1, summary };
  });
}
