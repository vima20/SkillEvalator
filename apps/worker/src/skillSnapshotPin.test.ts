import { describe, expect, it } from "vitest";
import {
  applySkillSnapshotLock,
  assertPinnedVersionMatchesLive,
  evalSkillVersionFromSnapshotManifest,
  resolvePinnedEvalSkillVersion,
} from "./skillSnapshotPin.js";

describe("evalSkillVersionFromSnapshotManifest", () => {
  it("reads trimmed _snapshot.evalSkillVersion", () => {
    expect(
      evalSkillVersionFromSnapshotManifest({
        _snapshot: { evalSkillVersion: "  abc123  " },
      }),
    ).toBe("abc123");
  });

  it("returns undefined when missing or empty", () => {
    expect(evalSkillVersionFromSnapshotManifest(null)).toBeUndefined();
    expect(evalSkillVersionFromSnapshotManifest({})).toBeUndefined();
    expect(
      evalSkillVersionFromSnapshotManifest({
        _snapshot: { evalSkillVersion: "   " },
      }),
    ).toBeUndefined();
  });
});

describe("resolvePinnedEvalSkillVersion", () => {
  it("prefers snapshot over result.json", () => {
    expect(
      resolvePinnedEvalSkillVersion({
        snapshotVersion: "snap",
        resultVersion: "result",
      }),
    ).toBe("snap");
  });

  it("falls back to result.json", () => {
    expect(
      resolvePinnedEvalSkillVersion({
        snapshotVersion: null,
        resultVersion: " from-result ",
      }),
    ).toBe("from-result");
  });
});

describe("assertPinnedVersionMatchesLive", () => {
  it("throws when version is missing", () => {
    expect(() =>
      assertPinnedVersionMatchesLive({
        priorRunId: "run_prior",
        pinnedVersion: undefined,
        liveVersion: "live",
      }),
    ).toThrow(/version missing/);
  });

  it("throws on fixture drift", () => {
    expect(() =>
      assertPinnedVersionMatchesLive({
        priorRunId: "run_prior",
        pinnedVersion: "old",
        liveVersion: "new",
      }),
    ).toThrow(/version drifted[\s\S]*was old[\s\S]*live new/);
  });

  it("returns pinned version when equal", () => {
    expect(
      assertPinnedVersionMatchesLive({
        priorRunId: "run_prior",
        pinnedVersion: "same",
        liveVersion: "same",
      }),
    ).toBe("same");
  });
});

describe("applySkillSnapshotLock", () => {
  it("locks candidate SKILL.md", () => {
    const out = applySkillSnapshotLock({
      role: "candidate",
      priorRunId: "run_p",
      lockedSkillMd: "# Skill\n",
      skillMdExists: true,
    });
    expect(out).toEqual({
      kind: "candidate",
      skillMd: "# Skill\n",
      finding: "skill md locked from snapshot of run_p",
    });
  });

  it("fails closed when candidate SKILL.md missing or unreadable", () => {
    expect(() =>
      applySkillSnapshotLock({
        role: "candidate",
        priorRunId: "run_p",
        lockedSkillMd: null,
        skillMdExists: false,
      }),
    ).toThrow(/snapshot missing/);
    expect(() =>
      applySkillSnapshotLock({
        role: "candidate",
        priorRunId: "run_p",
        lockedSkillMd: null,
        skillMdExists: true,
      }),
    ).toThrow(/snapshot invalid/);
  });

  it("baseline only records version-pin finding", () => {
    expect(
      applySkillSnapshotLock({
        role: "baseline",
        priorRunId: "run_b",
        lockedSkillMd: null,
        skillMdExists: false,
      }),
    ).toEqual({
      kind: "baseline",
      finding: "evalSkillVersion locked from snapshot of run_b",
    });
  });
});
