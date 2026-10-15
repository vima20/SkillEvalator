import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "./fsJson.js";
import {
  hashPromptInstruction,
  resolveTrustedPromptHashFromRunResultDir,
  resolveTrustedPromptHashFromSnapshotDir,
  resolveTrustedSnapshotManifestPinsFromRunResultDir,
  resolveTrustedSnapshotManifestPinsFromSnapshotDir,
} from "./promptSnapshot.js";

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("hashPromptInstruction", () => {
  it("is stable 16-char hex (worker rule)", () => {
    const a = hashPromptInstruction("hello skill");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hashPromptInstruction("hello skill")).toBe(a);
    expect(hashPromptInstruction("other")).not.toBe(a);
  });
});

describe("resolveTrustedPromptHashFromSnapshotDir", () => {
  it("hashes trimmed SKILL.md body", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-prompt-snap-"));
    temps.push(root);
    fs.writeFileSync(path.join(root, "SKILL.md"), "  body text\n\n", "utf8");
    expect(resolveTrustedPromptHashFromSnapshotDir(root)).toBe(
      hashPromptInstruction("body text"),
    );
  });

  it("returns undefined when SKILL.md missing or empty", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-prompt-empty-"));
    temps.push(root);
    expect(resolveTrustedPromptHashFromSnapshotDir(root)).toBeUndefined();
    fs.writeFileSync(path.join(root, "SKILL.md"), "   \n", "utf8");
    expect(resolveTrustedPromptHashFromSnapshotDir(root)).toBeUndefined();
  });
});

describe("resolveTrustedPromptHashFromRunResultDir", () => {
  it("reads run skill-snapshot", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-prompt-run-"));
    temps.push(root);
    const runId = "run_prompt_1";
    const snap = path.join(root, runId, "skill-snapshot");
    fs.mkdirSync(snap, { recursive: true });
    fs.writeFileSync(path.join(snap, "SKILL.md"), "candidate skill\n", "utf8");
    expect(resolveTrustedPromptHashFromRunResultDir(root, runId)).toBe(
      hashPromptInstruction("candidate skill"),
    );
  });
});

describe("resolveTrustedSnapshotManifestPinsFromSnapshotDir", () => {
  it("reads evalSkillVersion and promptKind from _snapshot", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-manif-pin-"));
    temps.push(root);
    writeJsonFile(path.join(root, "manifest.json"), {
      _snapshot: {
        evalSkillVersion: "  deadbeef  ",
        promptKind: "skill_md",
      },
    });
    expect(resolveTrustedSnapshotManifestPinsFromSnapshotDir(root)).toEqual({
      evalSkillVersion: "deadbeef",
      promptKind: "skill_md",
    });
  });

  it("returns empty when manifest missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-manif-miss-"));
    temps.push(root);
    expect(resolveTrustedSnapshotManifestPinsFromSnapshotDir(root)).toEqual(
      {},
    );
  });
});

describe("resolveTrustedSnapshotManifestPinsFromRunResultDir", () => {
  it("reads run skill-snapshot manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-manif-run-"));
    temps.push(root);
    const runId = "run_manif_1";
    const snap = path.join(root, runId, "skill-snapshot");
    fs.mkdirSync(snap, { recursive: true });
    writeJsonFile(path.join(snap, "manifest.json"), {
      _snapshot: {
        evalSkillVersion: "abc123",
        promptKind: "baseline_neutral",
      },
    });
    expect(
      resolveTrustedSnapshotManifestPinsFromRunResultDir(root, runId),
    ).toEqual({
      evalSkillVersion: "abc123",
      promptKind: "baseline_neutral",
    });
  });
});
