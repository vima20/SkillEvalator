import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./fsJson.js";
import { assertSafeId } from "./paths.js";

export type SnapshotPromptKind = "baseline_neutral" | "skill_md";

/** Pins from skill-snapshot/manifest.json (`_snapshot` + harness task set). */
export type TrustedSnapshotManifestPins = {
  evalSkillVersion?: string;
  promptKind?: SnapshotPromptKind;
  /** Official full task set id from skill-snapshot/manifest.json. */
  taskSetId?: string;
  /** Official full taskIds from skill-snapshot/manifest.json (not dryRunIds). */
  taskIds?: string[];
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

/** Read `_snapshot` pins + harness taskSetId/taskIds from skill-snapshot/manifest.json. */
export function resolveTrustedSnapshotManifestPinsFromSnapshotDir(
  snapshotDir: string,
): TrustedSnapshotManifestPins {
  try {
    const manPath = path.join(snapshotDir, "manifest.json");
    const st = fs.lstatSync(manPath);
    if (st.isSymbolicLink() || !st.isFile()) return {};
    const raw = readJsonFile(manPath) as {
      taskSetId?: unknown;
      taskIds?: unknown;
      _snapshot?: {
        evalSkillVersion?: unknown;
        promptKind?: unknown;
      };
    };
    const taskSetId =
      typeof raw.taskSetId === "string" ? raw.taskSetId.trim() : "";
    const taskIds = Array.isArray(raw.taskIds)
      ? raw.taskIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : [];
    const snap = raw?._snapshot;
    const version =
      snap && typeof snap === "object" && typeof snap.evalSkillVersion === "string"
        ? snap.evalSkillVersion.trim()
        : "";
    const kind =
      snap && typeof snap === "object" ? snap.promptKind : undefined;
    const promptKind: SnapshotPromptKind | undefined =
      kind === "baseline_neutral" || kind === "skill_md" ? kind : undefined;
    return {
      ...(version ? { evalSkillVersion: version } : {}),
      ...(promptKind ? { promptKind } : {}),
      ...(taskSetId ? { taskSetId } : {}),
      ...(taskIds.length > 0 ? { taskIds } : {}),
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
