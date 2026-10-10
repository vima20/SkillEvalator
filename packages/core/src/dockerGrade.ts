import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export type GradeResult = {
  exitCode: number;
  summary: string;
};

function withTempDir<T>(prefix: string, fn: (work: string) => T): T {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(work);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function copyTestsOnly(taskDir: string, destTaskDir: string): void {
  const testsSrc = path.join(taskDir, "tests");
  if (!fs.existsSync(testsSrc)) {
    throw new Error(`tests missing: ${testsSrc}`);
  }
  const testsDst = path.join(destTaskDir, "tests");
  fs.mkdirSync(testsDst, { recursive: true });
  for (const name of fs.readdirSync(testsSrc)) {
    const src = path.join(testsSrc, name);
    const st = fs.lstatSync(src);
    if (st.isSymbolicLink()) {
      throw new Error(`symlink not allowed in tests/: ${name}`);
    }
    if (st.isFile()) {
      fs.copyFileSync(src, path.join(testsDst, name));
    }
  }
}

/**
 * Grade artifact in Docker: node image, no network.
 * Mounts only skill scripts + tests/ + artifact — never expected/known-good/input.
 */
export function gradeInDocker(opts: {
  skillRoot: string;
  taskDir: string;
  targetFile: string;
  artifactPath: string;
  image?: string;
  timeoutMs?: number;
}): GradeResult {
  const image = opts.image ?? "node:22-bookworm-slim";
  const timeoutMs = opts.timeoutMs ?? 60_000;
  if (!fs.existsSync(opts.artifactPath)) {
    return { exitCode: 1, summary: "artifact missing" };
  }

  return withTempDir("cde-docker-", (work) => {
    const artifactDir = path.join(work, "artifact");
    const taskStage = path.join(work, "task");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.copyFileSync(opts.artifactPath, path.join(artifactDir, "artifact.js"));
    try {
      copyTestsOnly(opts.taskDir, taskStage);
    } catch (e) {
      return {
        exitCode: 1,
        summary: e instanceof Error ? e.message : "tests missing",
      };
    }

    const scriptsDir = path.join(opts.skillRoot, "scripts");
    if (!fs.existsSync(path.join(scriptsDir, "grade.js"))) {
      return { exitCode: 1, summary: "grade.js missing" };
    }

    const toDocker = (p: string) => p.replace(/\\/g, "/");
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
      `${toDocker(scriptsDir)}:/skill/scripts:ro`,
      "-v",
      `${toDocker(taskStage)}:/task:ro`,
      "-v",
      `${toDocker(artifactDir)}:/work:ro`,
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

    try {
      const r = spawnSync("docker", args, {
        encoding: "utf8",
        timeout: timeoutMs,
      });

      const summary = [r.stdout, r.stderr, r.error?.message]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2000);

      if (r.error) {
        return { exitCode: 1, summary: `docker error: ${r.error.message}` };
      }
      return { exitCode: r.status ?? 1, summary: summary || `exit ${r.status}` };
    } finally {
      // Ensure timeout/killed CLI cannot leave an orphan container.
      spawnSync("docker", ["rm", "-f", containerName], {
        encoding: "utf8",
        timeout: 15_000,
      });
    }
  });
}

/**
 * Host-side grade for smoke only. Caller must gate with FAKE_PRODUCE=known-good.
 * Mounts/copies only tests/ — never expected/known-good — and strips env secrets.
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
      copyTestsOnly(opts.taskDir, work);
    } catch (e) {
      return {
        exitCode: 1,
        summary: e instanceof Error ? e.message : "tests missing",
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
