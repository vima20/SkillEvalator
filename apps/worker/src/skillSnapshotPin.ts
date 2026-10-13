/**
 * Pure helpers for Retry skill-snapshot version + SKILL.md lock.
 * Kept free of config/fs so vitest can lock drift/missing-pin paths.
 */

export function evalSkillVersionFromSnapshotManifest(
  raw: unknown,
): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = (raw as { _snapshot?: { evalSkillVersion?: unknown } })._snapshot
    ?.evalSkillVersion;
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Prefer snapshot manifest version; fall back to prior result.json. */
export function resolvePinnedEvalSkillVersion(opts: {
  snapshotVersion?: string | null;
  resultVersion?: string | null;
}): string | undefined {
  const fromSnap = opts.snapshotVersion?.trim();
  if (fromSnap) return fromSnap;
  const fromResult = opts.resultVersion?.trim();
  if (fromResult) return fromResult;
  return undefined;
}

export function assertPinnedVersionMatchesLive(opts: {
  priorRunId: string;
  pinnedVersion: string | undefined;
  liveVersion: string;
}): string {
  if (!opts.pinnedVersion) {
    throw new Error(
      `skill snapshot version missing for ${opts.priorRunId} (no _snapshot.evalSkillVersion or result.json)`,
    );
  }
  if (opts.pinnedVersion !== opts.liveVersion) {
    throw new Error(
      `skill/fixtures version drifted since snapshot ${opts.priorRunId}: was ${opts.pinnedVersion}, live ${opts.liveVersion}`,
    );
  }
  return opts.pinnedVersion;
}

export type SkillSnapshotLock =
  | { kind: "candidate"; skillMd: string; finding: string }
  | { kind: "baseline"; finding: string };

/**
 * Candidate locks SKILL.md body; baseline only records the version pin finding.
 */
export function applySkillSnapshotLock(opts: {
  role: "baseline" | "candidate";
  priorRunId: string;
  lockedSkillMd: string | null;
  skillMdExists: boolean;
}): SkillSnapshotLock {
  if (opts.role === "candidate") {
    if (opts.lockedSkillMd == null) {
      throw new Error(
        opts.skillMdExists
          ? `skill snapshot invalid for ${opts.priorRunId} (not a readable regular file)`
          : `skill snapshot missing for ${opts.priorRunId}`,
      );
    }
    return {
      kind: "candidate",
      skillMd: opts.lockedSkillMd,
      finding: `skill md locked from snapshot of ${opts.priorRunId}`,
    };
  }
  return {
    kind: "baseline",
    finding: `evalSkillVersion locked from snapshot of ${opts.priorRunId}`,
  };
}
