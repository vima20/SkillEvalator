#!/usr/bin/env node
/**
 * Grade test-generation: ARTIFACT is generated tests; subject/ is the module under test.
 * Exit 0 = generated tests pass against subject.
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

  const subjectDir = path.join(taskDir, "subject");
  if (!fs.existsSync(subjectDir)) {
    console.error("subject missing:", subjectDir);
    process.exit(1);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tge-grade-"));
  let exitCode = 1;
  try {
    for (const name of fs.readdirSync(subjectDir)) {
      const src = path.join(subjectDir, name);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, path.join(work, name));
      }
    }
    fs.copyFileSync(artifactPath, path.join(work, targetFile));

    const r = spawnSync(process.execPath, [targetFile], {
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
