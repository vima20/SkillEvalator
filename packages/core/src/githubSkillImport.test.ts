import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "./fsJson.js";
import {
  SKILL_IMPORT_LOCK_STALE_MS,
  assertExtractSafe,
  importSkillsFromZip,
  parseGitHubSkillUrl,
} from "./githubSkillImport.js";
import { findRepoRoot } from "./paths.js";

const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function mkTemp(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}

/** Build a .zip via system tar (same extractor importSkillsFromZip uses). */
function zipDir(srcDir: string, zipPath: string): void {
  const parent = path.dirname(srcDir);
  const base = path.basename(srcDir);
  const r = spawnSync("tar", ["-a", "-cf", zipPath, "-C", parent, base], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.error) throw new Error(`zip failed: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(
      `zip failed: ${(r.stderr || r.stdout || `exit ${r.status}`).trim()}`,
    );
  }
}

function writeZipSkillPackage(pkgRoot: string, skillFolder: string): void {
  const skillRoot = path.join(pkgRoot, skillFolder);
  writeJsonFile(path.join(skillRoot, "fixtures", "manifest.json"), {
    taskSetId: "zip-ts-v1",
    taskSetDir: "zip-ts-v1",
    githubUrl: "https://github.com/acme/skills/tree/main/demo-skill",
    license: "MIT",
    dependencies: [],
    taskIds: ["bug-01"],
    dryRunIds: ["bug-01"],
    targetFile: { "bug-01": "fix.js" },
  });
  fs.writeFileSync(path.join(skillRoot, "SKILL.md"), "# demo zip skill\n", "utf8");
}

function writeSharedTaskset(skillsDir: string): void {
  const taskDir = path.join(skillsDir, "tasksets", "zip-ts-v1", "bug-01");
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "note.txt"), "fixture\n", "utf8");
}

describe("assertExtractSafe", () => {
  it("accepts a plain file tree", () => {
    const root = mkTemp("se-extract-ok-");
    fs.mkdirSync(path.join(root, "nested"), { recursive: true });
    fs.writeFileSync(path.join(root, "nested", "a.txt"), "x\n", "utf8");
    expect(() => assertExtractSafe(root)).not.toThrow();
  });

  it("rejects a symlink escape", () => {
    const root = mkTemp("se-extract-sym-");
    const outside = mkTemp("se-extract-out-");
    fs.writeFileSync(path.join(outside, "secret.txt"), "nope\n", "utf8");
    const link = path.join(root, "leak");
    try {
      fs.symlinkSync(outside, link, "dir");
    } catch {
      // Windows without Developer Mode / admin may block symlinks.
      return;
    }
    expect(() => assertExtractSafe(root)).toThrow(/symlink|junction|reparse/i);
  });

  it("rejects a Windows directory junction escape when available", () => {
    if (process.platform !== "win32") return;
    const root = mkTemp("se-extract-junc-");
    const outside = mkTemp("se-extract-junc-out-");
    fs.writeFileSync(path.join(outside, "secret.txt"), "nope\n", "utf8");
    const junction = path.join(root, "junc");
    const r = spawnSync(
      "cmd",
      ["/c", "mklink", "/J", junction, outside],
      { encoding: "utf8", windowsHide: true },
    );
    if (r.status !== 0) {
      // Privilege / path issues — skip rather than false-fail CI.
      return;
    }
    expect(() => assertExtractSafe(root)).toThrow(/symlink|junction|reparse/i);
  });
});

describe("parseGitHubSkillUrl", () => {
  it("parses owner/repo", () => {
    const r = parseGitHubSkillUrl("vima20/SkillEvalator");
    expect(r.owner).toBe("vima20");
    expect(r.repo).toBe("SkillEvalator");
    expect(r.ref).toBe("main");
    expect(r.subdir).toBe("");
  });

  it("parses owner/repo@ref/path", () => {
    const r = parseGitHubSkillUrl(
      "acme/skills@v1/eval-skills/code-debugging-eval",
    );
    expect(r.ref).toBe("v1");
    expect(r.subdir).toBe("eval-skills/code-debugging-eval");
  });

  it("parses tree URL", () => {
    const r = parseGitHubSkillUrl(
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills",
    );
    expect(r.owner).toBe("vima20");
    expect(r.subdir).toBe("eval-skills");
    expect(r.ref).toBe("main");
  });

  it("rejects non-github hosts", () => {
    expect(() =>
      parseGitHubSkillUrl("https://gitlab.com/acme/skills"),
    ).toThrow(/github\.com/);
  });

  it("rejects http", () => {
    expect(() =>
      parseGitHubSkillUrl("http://github.com/acme/skills"),
    ).toThrow(/https/);
  });
});

describe("importSkillsFromZip", () => {
  it("installs a skill from a local zip package", () => {
    const work = mkTemp("se-zip-ok-");
    const pkg = path.join(work, "pkg");
    const imported = path.join(work, "imported");
    const shared = path.join(work, "shared");
    writeZipSkillPackage(pkg, "demo-skill");
    writeSharedTaskset(shared);
    const zipPath = path.join(work, "demo-skill.zip");
    zipDir(pkg, zipPath);

    const result = importSkillsFromZip({
      zipPath,
      sourceLabel: "demo-skill.zip",
      importedSkillsDir: imported,
      tasksetSearchDirs: [shared],
    });

    expect(result.sourceLabel).toBe("demo-skill.zip");
    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0]!;
    expect(skill.id).toMatch(/^imp_local_demo-skill_/);
    expect(skill.ref).toBe("local-zip");
    expect(skill.pageUrl).toBe("local-zip:demo-skill.zip");
    expect(skill.taskCount).toBe(1);
    expect(skill.dryRunCount).toBe(1);

    const dest = path.join(imported, skill.importId);
    expect(fs.existsSync(path.join(dest, "fixtures", "manifest.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(dest, ".import.json"))).toBe(true);
    const meta = JSON.parse(
      fs.readFileSync(path.join(dest, ".import.json"), "utf8"),
    ) as { ref: string; pageUrl: string };
    expect(meta.ref).toBe("local-zip");
    expect(meta.pageUrl).toBe("local-zip:demo-skill.zip");
  });

  it("accepts zipBytes", () => {
    const work = mkTemp("se-zip-bytes-");
    const pkg = path.join(work, "pkg");
    const imported = path.join(work, "imported");
    const shared = path.join(work, "shared");
    writeZipSkillPackage(pkg, "byte-skill");
    writeSharedTaskset(shared);
    const zipPath = path.join(work, "byte-skill.zip");
    zipDir(pkg, zipPath);
    const zipBytes = fs.readFileSync(zipPath);

    const result = importSkillsFromZip({
      zipBytes,
      sourceLabel: "byte-skill.zip",
      importedSkillsDir: imported,
      tasksetSearchDirs: [shared],
    });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]!.id).toMatch(/^imp_local_byte-skill_/);
  });

  it("rejects empty archive", () => {
    expect(() =>
      importSkillsFromZip({
        zipBytes: Buffer.alloc(0),
        sourceLabel: "empty.zip",
        importedSkillsDir: mkTemp("se-zip-empty-"),
      }),
    ).toThrow(/empty archive/);
  });

  it("wraps zip with only SKILL.md using bundled cde-v1 harness", () => {
    const work = mkTemp("se-zip-agent-");
    const repo = findRepoRoot(process.cwd());
    const evalSkills = path.join(repo, "eval-skills");
    const pkg = path.join(work, "pkg", "net-skill");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "SKILL.md"), "# agent skill from zip\n", "utf8");
    const zipPath = path.join(work, "net-skill.zip");
    zipDir(path.join(work, "pkg"), zipPath);

    const result = importSkillsFromZip({
      zipPath,
      sourceLabel: "net-skill.zip",
      importedSkillsDir: path.join(work, "imported"),
      tasksetSearchDirs: [evalSkills],
    });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]!.wrappedFromAgentSkill).toBe(true);
    expect(result.skills[0]!.taskSetId).toBe("cde-v1");
    const dest = path.join(work, "imported", result.skills[0]!.importId);
    expect(fs.existsSync(path.join(dest, "fixtures", "manifest.json"))).toBe(
      true,
    );
    const meta = JSON.parse(
      fs.readFileSync(path.join(dest, ".import.json"), "utf8"),
    ) as { wrappedFromAgentSkill?: boolean };
    expect(meta.wrappedFromAgentSkill).toBe(true);
  });

  it("rejects zip with no SKILL.md or manifest", () => {
    const work = mkTemp("se-zip-nom-");
    const pkg = path.join(work, "pkg", "plain");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "README.md"), "nothing\n", "utf8");
    const zipPath = path.join(work, "plain.zip");
    zipDir(path.join(work, "pkg"), zipPath);

    expect(() =>
      importSkillsFromZip({
        zipPath,
        sourceLabel: "plain.zip",
        importedSkillsDir: path.join(work, "imported"),
      }),
    ).toThrow(/No skills found/);
  });

  it("steals a stale .importing lock after crash", () => {
    const work = mkTemp("se-zip-stale-");
    const pkg = path.join(work, "pkg");
    const imported = path.join(work, "imported");
    const shared = path.join(work, "shared");
    writeZipSkillPackage(pkg, "stale-skill");
    writeSharedTaskset(shared);
    const zipPath = path.join(work, "stale-skill.zip");
    zipDir(pkg, zipPath);

    const label = "stale-skill.zip";
    const importId = localImportId("stale-skill", label);
    fs.mkdirSync(imported, { recursive: true });
    const lockPath = path.join(imported, `${importId}.importing`);
    fs.writeFileSync(lockPath, "crashed", "utf8");
    const past = new Date(Date.now() - SKILL_IMPORT_LOCK_STALE_MS - 5_000);
    fs.utimesSync(lockPath, past, past);

    const result = importSkillsFromZip({
      zipPath,
      sourceLabel: label,
      importedSkillsDir: imported,
      tasksetSearchDirs: [shared],
    });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]!.importId).toBe(importId);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("rejects a fresh .importing lock", () => {
    const work = mkTemp("se-zip-fresh-");
    const pkg = path.join(work, "pkg");
    const imported = path.join(work, "imported");
    const shared = path.join(work, "shared");
    writeZipSkillPackage(pkg, "fresh-skill");
    writeSharedTaskset(shared);
    const zipPath = path.join(work, "fresh-skill.zip");
    zipDir(pkg, zipPath);

    const label = "fresh-skill.zip";
    const importId = localImportId("fresh-skill", label);
    fs.mkdirSync(imported, { recursive: true });
    fs.writeFileSync(
      path.join(imported, `${importId}.importing`),
      String(Date.now()),
      "utf8",
    );

    expect(() =>
      importSkillsFromZip({
        zipPath,
        sourceLabel: label,
        importedSkillsDir: imported,
        tasksetSearchDirs: [shared],
      }),
    ).toThrow(/import already in progress/);
  });
});

function localImportId(folder: string, sourceLabel: string): string {
  const safe = folder
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const hash = createHash("sha256")
    .update(sourceLabel)
    .digest("hex")
    .slice(0, 8);
  return `imp_local_${safe}_${hash}`;
}