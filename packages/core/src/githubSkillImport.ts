import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeJsonFile } from "./fsJson.js";
import { assertSafeId, resolveUnder } from "./paths.js";
import { SkillManifestSchema } from "./schema.js";
import { loadSkill, type SkillSummary } from "./skill.js";

/** Shared limit for GitHub download and local zip upload. */
export const SKILL_IMPORT_MAX_ZIP_BYTES = 80 * 1024 * 1024;
const MAX_ZIP_BYTES = SKILL_IMPORT_MAX_ZIP_BYTES;
const MAX_SKILLS = 30;
const MAX_WALK_DEPTH = 8;

export type GitHubSkillRef = {
  owner: string;
  repo: string;
  ref: string;
  /** Path inside the repo to search (empty = whole repo). */
  subdir: string;
  /** Canonical https URL without .git */
  pageUrl: string;
};

export type ImportedSkillInfo = SkillSummary & {
  importId: string;
  sourcePath: string;
  ref: string;
  pageUrl: string;
};

/**
 * Parse GitHub https URLs (repo, tree, blob) or owner/repo[@ref][/path].
 * Only github.com is allowed.
 */
export function parseGitHubSkillUrl(
  input: string,
  defaultRef = "main",
): GitHubSkillRef {
  const raw = input.trim();
  if (!raw) throw new Error("url required");

  if (!/^https?:\/\//i.test(raw)) {
    const m = raw.match(
      /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([^/\s]+))?(?:\/(.*))?$/,
    );
    if (!m) {
      throw new Error("invalid GitHub repo (use owner/repo or https URL)");
    }
    const owner = m[1]!;
    const repo = m[2]!.replace(/\.git$/i, "");
    const ref = m[3] || defaultRef;
    const subdir = (m[4] || "").replace(/^\/+|\/+$/g, "");
    return {
      owner,
      repo,
      ref,
      subdir,
      pageUrl: `https://github.com/${owner}/${repo}${subdir ? `/tree/${ref}/${subdir}` : ""}`,
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid URL");
  }
  if (url.protocol !== "https:") throw new Error("https URL required");
  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("only github.com repositories are supported");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("URL must include owner/repo");
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, "");
  let ref = defaultRef;
  let subdir = "";

  if (parts[2] === "tree" || parts[2] === "blob") {
    if (parts.length < 4) throw new Error("URL missing ref");
    ref = parts[3]!;
    const rest = parts.slice(4);
    if (parts[2] === "blob" && rest.length > 0) {
      rest.pop();
    }
    subdir = rest.join("/");
  } else if (parts.length > 2) {
    throw new Error("unsupported GitHub URL shape (use /tree/ref/path)");
  }

  return {
    owner,
    repo,
    ref,
    subdir,
    pageUrl: `https://github.com/${owner}/${repo}${
      subdir
        ? `/tree/${ref}/${subdir}`
        : ref !== defaultRef
          ? `/tree/${ref}`
          : ""
    }`,
  };
}

function importIdFor(ref: GitHubSkillRef, skillFolderName: string): string {
  const base = `imp_${ref.owner}_${ref.repo}_${skillFolderName}`
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return assertSafeId(base, "importId");
}

function findManifestRoots(root: string, maxDepth = MAX_WALK_DEPTH): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (found.length >= MAX_SKILLS) return;
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const hasManifest = entries.some(
      (e) => e.isFile() && e.name === "manifest.json",
    );
    const parent = path.basename(dir);
    if (parent === "fixtures" && hasManifest) {
      found.push(path.dirname(dir));
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") {
        continue;
      }
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

async function downloadZip(
  owner: string,
  repo: string,
  ref: string,
  destZip: string,
): Promise<void> {
  const candidates = [
    `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(ref)}`,
    `https://codeload.github.com/${owner}/${repo}/zip/refs/tags/${encodeURIComponent(ref)}`,
    `https://codeload.github.com/${owner}/${repo}/zip/${encodeURIComponent(ref)}`,
  ];
  let lastErr = "download failed";
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "SkillEvalator-import" },
        redirect: "follow",
      });
      if (!res.ok) {
        lastErr = `GitHub archive ${res.status} for ${ref}`;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0) {
        lastErr = "empty archive";
        continue;
      }
      if (buf.byteLength > MAX_ZIP_BYTES) {
        throw new Error(
          `archive too large (>${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB)`,
        );
      }
      fs.writeFileSync(destZip, buf);
      return;
    } catch (e) {
      if (e instanceof Error && e.message.includes("too large")) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

function extractZip(zipPath: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  const r = spawnSync("tar", ["-xf", zipPath, "-C", destDir], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.error) throw new Error(`unzip failed: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(
      `unzip failed: ${(r.stderr || r.stdout || `exit ${r.status}`).trim()}`,
    );
  }
  assertExtractSafe(destDir);
}

/** Reject zip-slip / symlink escapes after archive extract. */
function assertExtractSafe(root: string): void {
  const rootResolved = path.resolve(root);
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_WALK_DEPTH + 4) {
      throw new Error("extract tree too deep");
    }
    for (const name of fs.readdirSync(dir)) {
      if (name === ".." || name === ".") continue;
      const p = path.join(dir, name);
      const resolved = path.resolve(p);
      const rel = path.relative(rootResolved, resolved);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`zip-slip blocked: ${name}`);
      }
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) {
        throw new Error(`symlink not allowed in archive: ${rel || name}`);
      }
      if (st.isDirectory()) walk(p, depth + 1);
    }
  };
  walk(rootResolved, 0);
}

/** Recursive copy of regular files/dirs only (no symlinks). */
function copyTreeNoSymlinks(src: string, dest: string): void {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) {
    throw new Error(`symlink not allowed: ${path.basename(src)}`);
  }
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyTreeNoSymlinks(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  if (!st.isFile()) {
    throw new Error(`unsupported file type: ${path.basename(src)}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function singleTopDir(dir: string): string {
  const entries = fs.readdirSync(dir).filter((n) => n !== "__MACOSX");
  if (entries.length === 1) {
    const p = path.join(dir, entries[0]!);
    if (fs.statSync(p).isDirectory()) return p;
  }
  return dir;
}

function importIdForLocal(skillFolderName: string, sourceLabel: string): string {
  const safe = skillFolderName
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const hash = createHash("sha256")
    .update(sourceLabel)
    .digest("hex")
    .slice(0, 8);
  return assertSafeId(`imp_local_${safe}_${hash}`, "importId");
}

type InstallSource = {
  makeImportId: (folderName: string) => string;
  refLabel: string;
  pageUrl: string;
  owner?: string;
  repo?: string;
  /** Rewrite manifest githubUrl / commit when installing. */
  githubUrlFor?: (relPath: string) => string | undefined;
  commit?: string;
};

/**
 * Discover fixtures/manifest.json under searchRoot and install each skill.
 */
function installSkillsFromSearchRoot(opts: {
  searchRoot: string;
  /** Root used for relative sourcePath (often zip top / repo top). */
  contentRoot: string;
  importedSkillsDir: string;
  tasksetSearchDirs?: string[];
  source: InstallSource;
}): ImportedSkillInfo[] {
  const roots = findManifestRoots(opts.searchRoot);
  if (roots.length === 0) {
    throw new Error(
      "No SkillEvalator skills found (need fixtures/manifest.json). " +
        "Plain Agent Skills (SKILL.md only) cannot be graded until they ship an eval harness.",
    );
  }

  fs.mkdirSync(opts.importedSkillsDir, { recursive: true });
  const skills: ImportedSkillInfo[] = [];
  const loadRoots = [
    opts.importedSkillsDir,
    ...(opts.tasksetSearchDirs ?? []),
  ];

  for (const skillRoot of roots) {
    const folderName = path.basename(skillRoot);
    const importId = opts.source.makeImportId(folderName);
    const dest = resolveUnder(opts.importedSkillsDir, importId);
    const lockPath = `${dest}.importing`;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let lockFd: number | null = null;
    try {
      try {
        lockFd = fs.openSync(lockPath, "wx");
        fs.writeFileSync(lockFd, new Date().toISOString(), "utf8");
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code)
            : "";
        if (code === "EEXIST") {
          throw new Error(`import already in progress for ${importId}`);
        }
        throw err;
      }

      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      copyTreeNoSymlinks(skillRoot, dest);

      const sourcePath = path
        .relative(opts.contentRoot, skillRoot)
        .split(path.sep)
        .join("/");

      const manifestPath = path.join(dest, "fixtures", "manifest.json");
      try {
        const manifest = SkillManifestSchema.parse(
          JSON.parse(fs.readFileSync(manifestPath, "utf8")),
        );
        let taskSetDir = manifest.taskSetDir;
        if (!taskSetDir) {
          const candidate = manifest.taskSetId;
          for (const rootDir of [
            opts.importedSkillsDir,
            ...(opts.tasksetSearchDirs ?? []),
          ]) {
            try {
              const shared = path.join(rootDir, "tasksets", candidate);
              if (fs.existsSync(shared)) {
                taskSetDir = candidate;
                break;
              }
            } catch {
              /* try next */
            }
          }
        }
        const githubUrl =
          opts.source.githubUrlFor?.(sourcePath) ?? manifest.githubUrl;
        writeJsonFile(manifestPath, {
          ...manifest,
          ...(taskSetDir ? { taskSetDir } : {}),
          ...(githubUrl ? { githubUrl } : {}),
          ...(opts.source.commit ? { commit: opts.source.commit } : {}),
        });
      } catch (err) {
        try {
          fs.rmSync(dest, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        throw err;
      }

      writeJsonFile(path.join(dest, ".import.json"), {
        importId,
        ...(opts.source.owner ? { owner: opts.source.owner } : {}),
        ...(opts.source.repo ? { repo: opts.source.repo } : {}),
        ref: opts.source.refLabel,
        sourcePath,
        pageUrl: opts.source.pageUrl,
        importedAt: new Date().toISOString(),
      });

      let loaded: ReturnType<typeof loadSkill>;
      try {
        loaded = loadSkill(loadRoots, importId);
      } catch (err) {
        try {
          fs.rmSync(dest, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        throw err;
      }
      skills.push({
        importId,
        id: loaded.id,
        githubUrl: loaded.manifest.githubUrl,
        taskSetId: loaded.manifest.taskSetId,
        dryRunCount: loaded.manifest.dryRunIds.length,
        taskCount: loaded.manifest.taskIds.length,
        commit: loaded.manifest.commit,
        license: loaded.manifest.license,
        dependencies: loaded.manifest.dependencies,
        sourcePath,
        ref: opts.source.refLabel,
        pageUrl: opts.source.pageUrl,
      });
    } finally {
      if (lockFd != null) {
        try {
          fs.closeSync(lockFd);
        } catch {
          /* ignore */
        }
      }
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }
  }

  return skills;
}

/**
 * Download a GitHub repo archive, discover SkillEvalator skills
 * (directories with fixtures/manifest.json), install under importedSkillsDir.
 */
export async function importSkillsFromGitHub(opts: {
  url: string;
  importedSkillsDir: string;
  /** Extra roots for shared tasksets/ (e.g. local eval-skills). */
  tasksetSearchDirs?: string[];
  ref?: string;
}): Promise<{ ref: GitHubSkillRef; skills: ImportedSkillInfo[] }> {
  const gh = parseGitHubSkillUrl(opts.url, opts.ref ?? "main");
  if (opts.ref) gh.ref = opts.ref;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "se-import-"));
  const zipPath = path.join(tmp, "repo.zip");
  const extractDir = path.join(tmp, "extract");

  try {
    await downloadZip(gh.owner, gh.repo, gh.ref, zipPath);
    extractZip(zipPath, extractDir);
    const repoRoot = singleTopDir(extractDir);
    const searchRoot = gh.subdir
      ? resolveUnder(repoRoot, ...gh.subdir.split("/").filter(Boolean))
      : repoRoot;
    if (!fs.existsSync(searchRoot)) {
      throw new Error(`path not found in repo: ${gh.subdir}`);
    }

    const skills = installSkillsFromSearchRoot({
      searchRoot,
      contentRoot: repoRoot,
      importedSkillsDir: opts.importedSkillsDir,
      tasksetSearchDirs: opts.tasksetSearchDirs,
      source: {
        makeImportId: (folder) => importIdFor(gh, folder),
        refLabel: gh.ref,
        pageUrl: gh.pageUrl,
        owner: gh.owner,
        repo: gh.repo,
        githubUrlFor: (rel) =>
          `https://github.com/${gh.owner}/${gh.repo}/tree/${gh.ref}/${rel}`,
        commit: /^[0-9a-f]{7,40}$/i.test(gh.ref) ? gh.ref : undefined,
      },
    });

    return { ref: gh, skills };
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Unikie Find/Receive local package: extract a zip (same zip-slip rules as
 * GitHub codeload) and install discovered SkillEvalator skills.
 */
export function importSkillsFromZip(opts: {
  /** Absolute path to a .zip on disk, or raw zip bytes. */
  zipPath?: string;
  zipBytes?: Buffer;
  /** Display label (filename) stored in .import.json / pageUrl. */
  sourceLabel: string;
  importedSkillsDir: string;
  tasksetSearchDirs?: string[];
}): { sourceLabel: string; skills: ImportedSkillInfo[] } {
  const label = opts.sourceLabel.trim() || "local.zip";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "se-zip-import-"));
  const zipPath = path.join(tmp, "upload.zip");
  const extractDir = path.join(tmp, "extract");

  try {
    if (opts.zipBytes) {
      if (opts.zipBytes.byteLength === 0) throw new Error("empty archive");
      if (opts.zipBytes.byteLength > MAX_ZIP_BYTES) {
        throw new Error(
          `archive too large (>${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB)`,
        );
      }
      fs.writeFileSync(zipPath, opts.zipBytes);
    } else if (opts.zipPath) {
      const st = fs.statSync(opts.zipPath);
      if (!st.isFile()) throw new Error("zipPath is not a file");
      if (st.size === 0) throw new Error("empty archive");
      if (st.size > MAX_ZIP_BYTES) {
        throw new Error(
          `archive too large (>${Math.round(MAX_ZIP_BYTES / 1024 / 1024)}MB)`,
        );
      }
      fs.copyFileSync(opts.zipPath, zipPath);
    } else {
      throw new Error("zipPath or zipBytes required");
    }

    extractZip(zipPath, extractDir);
    const contentRoot = singleTopDir(extractDir);
    const skills = installSkillsFromSearchRoot({
      searchRoot: contentRoot,
      contentRoot,
      importedSkillsDir: opts.importedSkillsDir,
      tasksetSearchDirs: opts.tasksetSearchDirs,
      source: {
        makeImportId: (folder) => importIdForLocal(folder, label),
        refLabel: "local-zip",
        pageUrl: `local-zip:${label}`,
      },
    });

    return { sourceLabel: label, skills };
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
