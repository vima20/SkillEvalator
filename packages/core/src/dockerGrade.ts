import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type GradeResult = {
  exitCode: number;
  summary: string;
};

/**
 * Grade artifact in Docker: node image, no network, mount task + artifact.
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

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "cde-docker-"));
  const artifactName = "artifact.js";
  fs.copyFileSync(opts.artifactPath, path.join(work, artifactName));

  // Convert Windows paths for Docker Desktop
  const toDocker = (p: string) => p.replace(/\\/g, "/");

  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--memory",
    "256m",
    "--pids-limit",
    "128",
    "-v",
    `${toDocker(opts.skillRoot)}:/skill:ro`,
    "-v",
    `${toDocker(opts.taskDir)}:/task:ro`,
    "-v",
    `${toDocker(work)}:/work`,
    "-e",
    "TASK_DIR=/task",
    "-e",
    `TARGET_FILE=${opts.targetFile}`,
    "-e",
    `ARTIFACT_PATH=/work/${artifactName}`,
    image,
    "node",
    "/skill/scripts/grade.js",
  ];

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
}

/** Host-side grade for unit tests / CI without Docker when ALLOW_HOST_GRADE=1 */
export function gradeOnHost(opts: {
  skillRoot: string;
  taskDir: string;
  targetFile: string;
  artifactPath: string;
}): GradeResult {
  const gradeJs = path.join(opts.skillRoot, "scripts", "grade.js");
  const r = spawnSync(process.execPath, [gradeJs], {
    encoding: "utf8",
    timeout: 20_000,
    env: {
      ...process.env,
      TASK_DIR: opts.taskDir,
      TARGET_FILE: opts.targetFile,
      ARTIFACT_PATH: opts.artifactPath,
    },
  });
  const summary = [r.stdout, r.stderr].filter(Boolean).join("\n").slice(0, 2000);
  return { exitCode: r.status ?? 1, summary };
}
