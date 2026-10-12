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
 * For imported skills (`.import.json`), prefer a trusted local harness
 * `eval-skills/*/scripts` with the same taskSetId — never the imported grade.js.
 */
export function resolveTrustedScriptsDir(skillRoot: string): {
  scriptsDir: string;
  pinned: boolean;
} {
  const localScripts = path.join(skillRoot, "scripts");
  const isImported = fs.existsSync(path.join(skillRoot, ".import.json"));
  if (!isImported) {
    return { scriptsDir: localScripts, pinned: false };
  }

  let taskSetId: string | undefined;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(skillRoot, "fixtures", "manifest.json"), "utf8"),
    ) as { taskSetId?: string };
    taskSetId = raw.taskSetId;
  } catch {
    taskSetId = undefined;
  }
  if (!taskSetId) {
    throw new Error(
      "imported skill missing taskSetId — cannot pin trusted harness grade",
    );
  }

  let dir = path.resolve(skillRoot);
  for (let i = 0; i < 8; i++) {
    const evalSkills = path.join(dir, "eval-skills");
    if (fs.existsSync(evalSkills)) {
      for (const name of fs.readdirSync(evalSkills)) {
        const candidate = path.join(evalSkills, name);
        const manifestPath = path.join(candidate, "fixtures", "manifest.json");
        const gradeJs = path.join(candidate, "scripts", "grade.js");
        if (!fs.existsSync(manifestPath) || !fs.existsSync(gradeJs)) continue;
        try {
          const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
            taskSetId?: string;
          };
          if (m.taskSetId === taskSetId) {
            const st = fs.lstatSync(gradeJs);
            if (st.isSymbolicLink() || !st.isFile()) continue;
            return {
              scriptsDir: path.join(candidate, "scripts"),
              pinned: true,
            };
          }
        } catch {
          /* try next */
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `imported skill: no trusted harness grade for taskSetId ${taskSetId}`,
  );
}

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

    let scriptsDir: string;
    try {
      scriptsDir = resolveTrustedScriptsDir(opts.skillRoot).scriptsDir;
    } catch (e) {
      return {
        exitCode: 1,
        summary: e instanceof Error ? e.message : "scripts resolve failed",
      };
    }
    const gradeJs = path.join(scriptsDir, "grade.js");
    if (!fs.existsSync(gradeJs)) {
      return { exitCode: 1, summary: "grade.js missing" };
    }
    try {
      const st = fs.lstatSync(gradeJs);
      if (st.isSymbolicLink() || !st.isFile()) {
        return { exitCode: 1, summary: "grade.js must be a regular file" };
      }
    } catch (e) {
      return {
        exitCode: 1,
        summary: e instanceof Error ? e.message : "grade.js unreadable",
      };
    }

    // Stage scripts without following symlinks (import integrity).
    const scriptsStage = path.join(work, "scripts");
    try {
      copyDirFiles(scriptsDir, scriptsStage);
    } catch (e) {
      return {
        exitCode: 1,
        summary: e instanceof Error ? e.message : "scripts stage failed",
      };
    }
    if (!fs.existsSync(path.join(scriptsStage, "grade.js"))) {
      return { exitCode: 1, summary: "grade.js missing after stage" };
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
      `${toDockerBindPath(scriptsStage)}:/skill/scripts:ro`,
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
  // Imported skills must not run grade.js on the host (RCE / self-cert risk).
  if (fs.existsSync(path.join(opts.skillRoot, ".import.json"))) {
    return {
      exitCode: 1,
      summary: "host grade blocked for imported skills — use Docker grade",
    };
  }
  const gradeJs = path.join(opts.skillRoot, "scripts", "grade.js");
  if (!fs.existsSync(gradeJs)) {
    return { exitCode: 1, summary: "grade.js missing" };
  }
  try {
    const st = fs.lstatSync(gradeJs);
    if (st.isSymbolicLink() || !st.isFile()) {
      return { exitCode: 1, summary: "grade.js must be a regular file" };
    }
  } catch (e) {
    return {
      exitCode: 1,
      summary: e instanceof Error ? e.message : "grade.js unreadable",
    };
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
