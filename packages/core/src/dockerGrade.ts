import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { assertRealDirectory, readRegularFileUtf8 } from "./fsSafe.js";
import { stripBom } from "./fsJson.js";
import { assertSafeId } from "./paths.js";

export type GradeResult = {
  exitCode: number;
  summary: string;
};

type TrustedMatch = {
  skillId: string;
  scriptsDir: string;
  gradeHash: string;
};

function readImportedManifest(skillRoot: string): {
  taskSetId?: string;
  taskSetDir?: string;
} {
  const fixturesDir = path.join(skillRoot, "fixtures");
  assertRealDirectory(fixturesDir, "fixtures");
  return JSON.parse(
    stripBom(
      readRegularFileUtf8(
        path.join(fixturesDir, "manifest.json"),
        "manifest.json",
      ),
    ),
  ) as { taskSetId?: string; taskSetDir?: string };
}

function scriptsDirIfTrustedGrade(
  skillDir: string,
  skillId: string,
): TrustedMatch | null {
  const gradeJs = path.join(skillDir, "scripts", "grade.js");
  if (!fs.existsSync(gradeJs)) return null;
  try {
    const st = fs.lstatSync(gradeJs);
    if (st.isSymbolicLink() || !st.isFile()) return null;
    const gradeHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(gradeJs))
      .digest("hex");
    return {
      skillId,
      scriptsDir: path.join(skillDir, "scripts"),
      gradeHash,
    };
  } catch {
    return null;
  }
}

/** Prefer tasksets/<taskSetDir>/harness.json → scriptsFromSkillId. */
function pinFromHarnessJson(
  evalSkillsDir: string,
  taskSetDir: string,
): TrustedMatch | null {
  let safeSet: string;
  try {
    safeSet = assertSafeId(taskSetDir, "taskSetDir");
  } catch {
    return null;
  }
  const setDir = path.join(evalSkillsDir, "tasksets", safeSet);
  const harnessPath = path.join(setDir, "harness.json");
  if (!fs.existsSync(harnessPath)) return null;
  try {
    assertRealDirectory(setDir, `tasksets/${safeSet}`);
    const raw = JSON.parse(
      stripBom(readRegularFileUtf8(harnessPath, "harness.json")),
    ) as { scriptsFromSkillId?: string };
    if (typeof raw.scriptsFromSkillId !== "string") return null;
    const skillId = assertSafeId(raw.scriptsFromSkillId, "evalSkillId");
    const skillDir = path.join(evalSkillsDir, skillId);
    assertRealDirectory(skillDir, skillId);
    return scriptsDirIfTrustedGrade(skillDir, skillId);
  } catch {
    return null;
  }
}

/**
 * All local skills with matching taskSetId and a regular grade.js.
 * Sorted by skill id for deterministic fallback.
 */
function collectTaskSetMatches(
  evalSkillsDir: string,
  taskSetId: string,
): TrustedMatch[] {
  const out: TrustedMatch[] = [];
  for (const name of fs.readdirSync(evalSkillsDir).sort()) {
    if (name === "tasksets" || name === "node_modules") continue;
    const candidate = path.join(evalSkillsDir, name);
    try {
      assertRealDirectory(candidate, name);
    } catch {
      continue;
    }
    const fixturesDir = path.join(candidate, "fixtures");
    const manifestPath = path.join(fixturesDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      assertRealDirectory(fixturesDir, `${name}/fixtures`);
      const m = JSON.parse(
        stripBom(readRegularFileUtf8(manifestPath, "manifest.json")),
      ) as { taskSetId?: string };
      if (m.taskSetId !== taskSetId) continue;
      const match = scriptsDirIfTrustedGrade(candidate, name);
      if (match) out.push(match);
    } catch {
      /* try next */
    }
  }
  return out;
}

function pickDeterministicMatch(
  matches: TrustedMatch[],
  taskSetId: string,
): TrustedMatch {
  if (matches.length === 0) {
    throw new Error(
      "imported skill: no trusted harness grade for taskSetId " + taskSetId,
    );
  }
  // Fail closed on any multi-match — even identical grade.js hashes must not
  // silently pick lexicographic first (aaa-poison risk without harness.json).
  if (matches.length > 1) {
    const hashes = new Set(matches.map((m) => m.gradeHash));
    const detail =
      hashes.size > 1
        ? "differing grade.js hashes"
        : "multiple skills share the same grade.js";
    throw new Error(
      `imported skill: ambiguous trusted harness for taskSetId ${taskSetId} ` +
        `(${matches.map((m) => m.skillId).join(", ")}; ${detail}); ` +
        `add tasksets/<id>/harness.json`,
    );
  }
  return matches[0]!;
}

/** sha256 of a regular grade.js; undefined when missing/unreadable. */
export function hashGradeJsFile(gradeJsPath: string): string | undefined {
  try {
    const st = fs.lstatSync(gradeJsPath);
    if (st.isSymbolicLink() || !st.isFile()) return undefined;
    return crypto
      .createHash("sha256")
      .update(fs.readFileSync(gradeJsPath))
      .digest("hex");
  } catch {
    return undefined;
  }
}

/**
 * Trusted grade.js hash from a run's skill-snapshot (what the worker graded).
 * Undefined when snapshot/grade.js is missing — callers fail closed for official.
 */
export function resolveTrustedGradeHashFromRunResultDir(
  resultsDirPath: string,
  runId: string,
): string | undefined {
  try {
    const id = assertSafeId(runId, "runId");
    const snapRoot = path.join(resultsDirPath, id, "skill-snapshot");
    if (!fs.existsSync(snapRoot)) return undefined;
    const hash = resolveTrustedScriptsDir(snapRoot).gradeHash?.trim();
    return hash || undefined;
  } catch {
    return undefined;
  }
}

function copyRegularFiles(srcDir: string, destDir: string): number {
  fs.mkdirSync(destDir, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(src);
    } catch {
      continue;
    }
    if (st.isSymbolicLink() || !st.isFile()) continue;
    fs.copyFileSync(src, path.join(destDir, name));
    n += 1;
  }
  return n;
}

/**
 * Copy trusted harness scripts (at least grade.js) into skill-snapshot/scripts
 * so disk Comparison can resolve expectedGradeHash without opts injection.
 * Returns sha256 of the pinned snapshot grade.js.
 */
export function pinTrustedScriptsIntoSkillSnapshot(
  skillRoot: string,
  snapshotDir: string,
): string {
  const resolved = resolveTrustedScriptsDir(skillRoot);
  const destScripts = path.join(snapshotDir, "scripts");
  const copied = copyRegularFiles(resolved.scriptsDir, destScripts);
  if (copied === 0) {
    throw new Error(
      `no trusted scripts to pin from ${resolved.scriptsDir} into ${destScripts}`,
    );
  }
  const hash = hashGradeJsFile(path.join(destScripts, "grade.js"))?.trim();
  if (!hash) {
    throw new Error(
      `grade.js missing or unreadable after pin into ${destScripts}`,
    );
  }
  return hash;
}

/** Copy skill-snapshot/scripts from a prior run (Retry seed). */
export function copySkillSnapshotScripts(opts: {
  fromSnapshotDir: string;
  toSnapshotDir: string;
}): boolean {
  const src = path.join(opts.fromSnapshotDir, "scripts");
  if (!fs.existsSync(src)) return false;
  try {
    const dest = path.join(opts.toSnapshotDir, "scripts");
    copyRegularFiles(src, dest);
    return Boolean(hashGradeJsFile(path.join(dest, "grade.js")));
  } catch {
    return false;
  }
}

/**
 * For imported skills (.import.json), prefer a trusted local harness
 * under eval-skills/<id>/scripts — never the imported grade.js.
 * Pin order: harness.json → single taskSetId match (multi-match fail-closed).
 * Always returns gradeHash of the scripts that will actually run when readable.
 */
export function resolveTrustedScriptsDir(skillRoot: string): {
  scriptsDir: string;
  pinned: boolean;
  gradeHash?: string;
} {
  const localScripts = path.join(skillRoot, "scripts");
  const isImported = fs.existsSync(path.join(skillRoot, ".import.json"));
  if (!isImported) {
    return {
      scriptsDir: localScripts,
      pinned: false,
      gradeHash: hashGradeJsFile(path.join(localScripts, "grade.js")),
    };
  }

  let taskSetId: string | undefined;
  let taskSetDir: string | undefined;
  try {
    const raw = readImportedManifest(skillRoot);
    taskSetId = raw.taskSetId;
    taskSetDir = raw.taskSetDir;
  } catch {
    taskSetId = undefined;
  }
  if (!taskSetId) {
    throw new Error(
      "imported skill missing taskSetId - cannot pin trusted harness grade",
    );
  }

  // Never search under the imported skill tree (poisoned eval-skills/).
  const skillResolved = path.resolve(skillRoot);
  let dir = path.dirname(skillResolved);
  for (let i = 0; i < 8; i++) {
    const evalSkills = path.join(dir, "eval-skills");
    if (fs.existsSync(evalSkills)) {
      const evalResolved = path.resolve(evalSkills);
      const nestedUnderSkill =
        evalResolved === skillResolved ||
        evalResolved.startsWith(skillResolved + path.sep);
      if (!nestedUnderSkill) {
        try {
          assertRealDirectory(evalSkills, "eval-skills");
        } catch {
          /* try parent */
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
          continue;
        }
        if (taskSetDir) {
          const pinned = pinFromHarnessJson(evalSkills, taskSetDir);
          if (pinned) {
            return {
              scriptsDir: pinned.scriptsDir,
              pinned: true,
              gradeHash: pinned.gradeHash,
            };
          }
        }
        const matches = collectTaskSetMatches(evalSkills, taskSetId);
        const chosen = pickDeterministicMatch(matches, taskSetId);
        return {
          scriptsDir: chosen.scriptsDir,
          pinned: true,
          gradeHash: chosen.gradeHash,
        };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    "imported skill: no trusted harness grade for taskSetId " + taskSetId,
  );
}

/**
 * Host path for Docker Desktop bind mounts.
 * Windows C:\foo becomes /c/foo (also accepts already-posix paths).
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
  assertRealDirectory(srcDir, path.basename(srcDir) || "grade-src");
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
