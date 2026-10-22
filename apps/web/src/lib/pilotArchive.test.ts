import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "@skillevalator/core";
import {
  buildPilotArchiveZip,
  pilotArchiveGate,
} from "./pilotArchive.js";

const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("pilotArchiveGate", () => {
  it("allows official PASS/FAIL without smoke", () => {
    expect(
      pilotArchiveGate({
        comparison: { verdict: "PASS", mode: "official" },
        baselineProduceAttested: true,
        candidateProduceAttested: true,
      }).ok,
    ).toBe(true);
    expect(
      pilotArchiveGate({
        comparison: { verdict: "FAIL", mode: "official" },
        baselineProduceAttested: true,
        candidateProduceAttested: true,
      }).ok,
    ).toBe(true);
  });

  it("rejects dry-run, smoke meta, and FAKE_PRODUCE", () => {
    expect(
      pilotArchiveGate({
        comparison: { verdict: "PASS", mode: "dry-run" },
      }).ok,
    ).toBe(false);
    const smoke = pilotArchiveGate({
      comparison: { verdict: "PASS", mode: "official" },
      metaSmoke: true,
    });
    expect(smoke.ok).toBe(false);
    if (!smoke.ok) {
      expect(smoke.errorCode).toBe("comparison_export_smoke_forbidden");
      expect(smoke.error).toMatch(/pilot archive/i);
    }
    const fake = pilotArchiveGate({
      comparison: { verdict: "FAIL", mode: "official" },
      candidateFakeProduce: true,
    });
    expect(fake.ok).toBe(false);
    if (!fake.ok) {
      expect(fake.errorCode).toBe("comparison_export_fake_produce_forbidden");
    }
  });
});

describe("buildPilotArchiveZip", () => {
  it("packs tip legs, evaluation, comparison, and MANIFEST", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-pilot-zip-"));
    temps.push(root);
    const resultsDir = path.join(root, "results");
    const evaluationId = "eval_100_pilotzip";
    const baselineRunId = "run_100_pilotbase";
    const candidateRunId = "run_100_pilotcand";

    writeJsonFile(path.join(resultsDir, evaluationId, "evaluation.json"), {
      evaluationId,
      baselineRunId,
      candidateRunId,
      mode: "official",
      evalSkillId: "code-debugging-eval",
      createdAt: "2026-10-15T00:00:00.000Z",
    });
    for (const [id, role] of [
      [baselineRunId, "baseline"],
      [candidateRunId, "candidate"],
    ] as const) {
      writeJsonFile(path.join(resultsDir, id, "status.json"), {
        runId: id,
        status: "ok",
        role,
      });
      writeJsonFile(path.join(resultsDir, id, "result.json"), {
        runId: id,
        status: "ok",
        role,
        mode: "official",
        score: role === "candidate" ? 1 : 0.9,
      });
      fs.mkdirSync(path.join(resultsDir, id, "skill-snapshot"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(resultsDir, id, "skill-snapshot", "grade.js"),
        "// pin\n",
      );
    }

    const comparison = {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      taskSetId: "cde-v1",
      mode: "official" as const,
      modelId: "gpt-4.1-mini",
      verdict: "PASS" as const,
      lift: 0.1,
      baselineRunId,
      candidateRunId,
      baselineScore: 0.9,
      candidateScore: 1,
      rationale: "test",
      capture: {},
    };

    const zip = buildPilotArchiveZip({
      resultsDir,
      evaluationId,
      baselineRunId,
      candidateRunId,
      comparison: comparison as never,
      meta: {
        evaluationId,
        evalSkillId: "code-debugging-eval",
        mode: "official",
        baselineRunId,
        candidateRunId,
        createdAt: "2026-10-15T00:00:00.000Z",
      },
      build: {
        gitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        gitShaShort: "aaaaaaa",
        dirty: false,
      },
      createdAt: "2026-10-15T12:00:00.000Z",
    });

    expect(zip.byteLength).toBeGreaterThan(100);
    // ZIP local file header magic
    expect(zip.subarray(0, 2).toString("binary")).toBe("PK");
  });

  it("MANIFEST mode uses adoptionMode and records stale comparisonJsonMode", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-pilot-manifest-"));
    temps.push(root);
    const resultsDir = path.join(root, "results");
    const evaluationId = "eval_manifest_mode";
    const baselineRunId = "run_manifest_base";
    const candidateRunId = "run_manifest_cand";
    writeJsonFile(path.join(resultsDir, evaluationId, "evaluation.json"), {
      evaluationId,
      baselineRunId,
      candidateRunId,
      mode: "official",
      evalSkillId: "code-debugging-eval",
      createdAt: "2026-10-15T00:00:00.000Z",
    });
    const comparison = {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      taskSetId: "cde-v1",
      mode: "dry-run" as const,
      modelId: "gpt-4.1-mini",
      verdict: "PASS" as const,
      lift: 0.1,
      baselineRunId,
      candidateRunId,
      baselineScore: 0.9,
      candidateScore: 1,
      rationale: "test",
      capture: {},
    };
    const zip = buildPilotArchiveZip({
      resultsDir,
      evaluationId,
      baselineRunId,
      candidateRunId,
      comparison: comparison as never,
      meta: {
        evaluationId,
        evalSkillId: "code-debugging-eval",
        mode: "official",
        baselineRunId,
        candidateRunId,
        createdAt: "2026-10-15T00:00:00.000Z",
      },
      build: {
        gitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        gitShaShort: "bbbbbbb",
        dirty: false,
      },
      adoptionMode: "official",
    });
    const zipPath = path.join(root, "out.zip");
    fs.writeFileSync(zipPath, zip);
    const extractDir = path.join(root, "extract");
    fs.mkdirSync(extractDir, { recursive: true });
    const tar = spawnSync(
      "tar",
      ["-xf", zipPath, "-C", extractDir, "MANIFEST.json"],
      { encoding: "utf8", windowsHide: true },
    );
    expect(tar.status).toBe(0);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extractDir, "MANIFEST.json"), "utf8"),
    ) as { mode: string; comparisonJsonMode?: string };
    expect(manifest.mode).toBe("official");
    expect(manifest.comparisonJsonMode).toBe("dry-run");
  });
});
