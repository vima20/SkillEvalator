import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./fsJson.js";
import { assertSafeId } from "./paths.js";

export type SnapshotPromptKind = "baseline_neutral" | "skill_md";

/** Pins from skill-snapshot/manifest.json `_snapshot` (worker write). */
export type TrustedSnapshotManifestPins = {
  evalSkillVersion?: string;
  promptKind?: SnapshotPromptKind;
};

/**
 * Same rule as worker runJob: sha256(instruction).hex.slice(0, 16).
 * Instruction is the produce prompt body (trimmed skillMd or baseline neutral).
 */
export function hashPromptInstruction(instruction: string): string {
  return crypto
    .createHash("sha256")
    .update(instruction)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Trusted prompt hash from skill-snapshot/SKILL.md (trim → hash).
 * Undefined when missing/empty/unreadable — callers fail closed for official.
 */
export function resolveTrustedPromptHashFromSnapshotDir(
  snapshotDir: string,
): string | undefined {
  try {
    const mdPath = path.join(snapshotDir, "SKILL.md");
    const st = fs.lstatSync(mdPath);
    if (st.isSymbolicLink() || !st.isFile()) return undefined;
    const body = fs.readFileSync(mdPath, "utf8").trim();
    if (!body) return undefined;
    return hashPromptInstruction(body);
  } catch {
    return undefined;
  }
}

/**
 * Trusted prompt hash from a run's skill-snapshot (what the worker produced with).
 */
export function resolveTrustedPromptHashFromRunResultDir(
  resultsDirPath: string,
  runId: string,
): string | undefined {
  try {
    const id = assertSafeId(runId, "runId");
    const snapRoot = path.join(resultsDirPath, id, "skill-snapshot");
    if (!fs.existsSync(snapRoot)) return undefined;
    return resolveTrustedPromptHashFromSnapshotDir(snapRoot);
  } catch {
    return undefined;
  }
}

/** Read `_snapshot.evalSkillVersion` / `promptKind` from skill-snapshot/manifest.json. */
export function resolveTrustedSnapshotManifestPinsFromSnapshotDir(
  snapshotDir: string,
): TrustedSnapshotManifestPins {
  try {
    const manPath = path.join(snapshotDir, "manifest.json");
    const st = fs.lstatSync(manPath);
    if (st.isSymbolicLink() || !st.isFile()) return {};
    const raw = readJsonFile(manPath) as {
      _snapshot?: {
        evalSkillVersion?: unknown;
        promptKind?: unknown;
      };
    };
    const snap = raw?._snapshot;
    if (!snap || typeof snap !== "object") return {};
    const version =
      typeof snap.evalSkillVersion === "string"
        ? snap.evalSkillVersion.trim()
        : "";
    const kind = snap.promptKind;
    const promptKind: SnapshotPromptKind | undefined =
      kind === "baseline_neutral" || kind === "skill_md" ? kind : undefined;
    return {
      ...(version ? { evalSkillVersion: version } : {}),
      ...(promptKind ? { promptKind } : {}),
    };
  } catch {
    return {};
  }
}

export function resolveTrustedSnapshotManifestPinsFromRunResultDir(
  resultsDirPath: string,
  runId: string,
): TrustedSnapshotManifestPins {
  try {
    const id = assertSafeId(runId, "runId");
    const snapRoot = path.join(resultsDirPath, id, "skill-snapshot");
    if (!fs.existsSync(snapRoot)) return {};
    return resolveTrustedSnapshotManifestPinsFromSnapshotDir(snapRoot);
  } catch {
    return {};
  }
}
