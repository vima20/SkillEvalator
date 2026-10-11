#!/usr/bin/env node
/**
 * Grade one task: ARTIFACT_PATH + TASK_DIR (fixtures/<id>) → run tests.
 * Exit 0 = pass, 1 = fail.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");

function main() {
  const taskDir = process.env.TASK_DIR;
  const artifactPath = process.env.ARTIFACT_PATH;
  const targetFile = process.env.TARGET_FILE;
  if (!taskDir || !artifactPath || !targetFile) {
    console.error("TASK_DIR, ARTIFACT_PATH, TARGET_FILE required");
    process.exit(1);
  }
  if (!fs.existsSync(artifactPath)) {
    console.error("artifact missing:", artifactPath);
    process.exit(1);
  }

  const testsSrc = path.join(taskDir, "tests");
  if (!fs.existsSync(testsSrc)) {
    console.error("tests missing:", testsSrc);
    process.exit(1);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "cde-grade-"));
  let exitCode = 1;
  try {
    const destFile = path.join(work, targetFile);
    fs.copyFileSync(artifactPath, destFile);
    for (const name of fs.readdirSync(testsSrc)) {
      fs.copyFileSync(path.join(testsSrc, name), path.join(work, name));
    }

    const r = spawnSync(process.execPath, ["test.js"], {
      cwd: work,
      encoding: "utf8",
      timeout: 15000,
    });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    exitCode = r.status === 0 ? 0 : 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

main();
