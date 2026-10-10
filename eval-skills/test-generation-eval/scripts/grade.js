#!/usr/bin/env node
/**
 * Grade test-generation:
 * 1) ARTIFACT tests must PASS against subject/
 * 2) Same tests must FAIL against subject-bad/ (catches weak tests)
 * Exit 0 only if both checks hold.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");

function copyFiles(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(destDir, name));
    }
  }
}

function runTests(work, targetFile) {
  return spawnSync(process.execPath, [targetFile], {
    cwd: work,
    encoding: "utf8",
    timeout: 15000,
  });
}

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
  const subjectBadDir = path.join(taskDir, "subject-bad");
  if (!fs.existsSync(subjectDir)) {
    console.error("subject missing:", subjectDir);
    process.exit(1);
  }
  if (!fs.existsSync(subjectBadDir)) {
    console.error("subject-bad missing:", subjectBadDir);
    process.exit(1);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tge-grade-"));
  let exitCode = 1;
  try {
    fs.copyFileSync(artifactPath, path.join(work, targetFile));

    // 1) Must pass on correct subject
    copyFiles(subjectDir, work);
    const good = runTests(work, targetFile);
    if (good.stdout) process.stdout.write(good.stdout);
    if (good.stderr) process.stderr.write(good.stderr);
    if (good.status !== 0) {
      console.error("fail: tests did not pass against subject/");
      process.exit(1);
    }

    // 2) Must fail on broken subject (otherwise tests are too weak)
    for (const name of fs.readdirSync(subjectDir)) {
      const p = path.join(work, name);
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
    copyFiles(subjectBadDir, work);
    const bad = runTests(work, targetFile);
    if (bad.status === 0) {
      console.error(
        "fail: tests also passed against subject-bad/ (coverage too weak)",
      );
      process.exit(1);
    }

    console.log("ok (pass subject, reject subject-bad)");
    exitCode = 0;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

main();
