import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJsonFile } from "@skillevalator/core";
import { formatRetryCostBlockedReason } from "./retryCostAdmissionCopy.js";

const temps: string[] = [];
let jobsRoot = "";

vi.mock("@/lib/paths", () => ({
  jobsDir: () => jobsRoot,
  resultsDir: () => path.join(jobsRoot, "..", "results"),
  skillsDirs: () => [],
  skillsDir: () => "",
  importedSkillsDir: () => "",
  repoRoot: () => path.join(jobsRoot, ".."),
}));

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  vi.resetModules();
});

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-cost-"));
  temps.push(root);
  jobsRoot = path.join(root, "jobs");
  fs.mkdirSync(jobsRoot, { recursive: true });
});

describe("formatRetryCostBlockedReason / retryCostAdmissionFromGate", () => {
  it("maps deny gate to New run cost-cap copy", async () => {
    const { retryCostAdmissionFromGate } = await import(
      "./retryCostAdmission.js"
    );
    const out = retryCostAdmissionFromGate({
      ok: false,
      status: 400,
      errorCode: "enqueue_cost_over_cap",
      estimatedUsd: 1.25,
      costCapUsd: 0.5,
      error: "per-leg estimate $1.2500 exceeds COST_CAP_USD $0.5",
    });
    expect(out.blocked).toBe(true);
    expect(out.errorCode).toBe("enqueue_cost_over_cap");
    expect(out.estimatedUsd).toBe(1.25);
    expect(out.costCapUsd).toBe(0.5);
    expect(out.reason).toBe(formatRetryCostBlockedReason(0.5));
    expect(out.reason).toMatch(/COST_CAP_USD/);
  });

  it("maps ok gate to not blocked", async () => {
    const { retryCostAdmissionFromGate } = await import(
      "./retryCostAdmission.js"
    );
    expect(retryCostAdmissionFromGate({ ok: true })).toEqual({
      blocked: false,
      reason: null,
    });
  });
});

describe("resolveRetryCostParams", () => {
  it("uses result when no terminal job", async () => {
    const { resolveRetryCostParams } = await import("./retryCostAdmission.js");
    expect(
      resolveRetryCostParams({
        runId: "no-such-run-for-cost-params",
        result: {
          evalSkillId: "code-debugging-eval",
          mode: "official",
          repeats: 3,
        },
      }),
    ).toEqual({
      evalSkillId: "code-debugging-eval",
      mode: "official",
      repeats: 3,
    });
  });

  it("falls back to status.repeats when result omits repeats and no job", async () => {
    const { resolveRetryCostParams } = await import("./retryCostAdmission.js");
    expect(
      resolveRetryCostParams({
        runId: "no-such-run-for-cost-params",
        result: {
          evalSkillId: "code-debugging-eval",
          mode: "dry-run",
        },
        status: { repeats: 2 },
      }),
    ).toEqual({
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      repeats: 2,
    });
  });

  it("returns null when mode is not enqueueable and no job file", async () => {
    const { resolveRetryCostParams } = await import("./retryCostAdmission.js");
    expect(
      resolveRetryCostParams({
        runId: "no-such-run-for-cost-params",
        result: {
          evalSkillId: "code-debugging-eval",
          mode: "unknown",
          repeats: 1,
        },
      }),
    ).toBeNull();
  });

  it("prefers terminal job over result (same as POST /retry)", async () => {
    const { resolveRetryCostParams } = await import("./retryCostAdmission.js");
    const runId = "run_cost_jobfirst";
    writeJsonFile(path.join(jobsRoot, `${runId}.failed.json`), {
      runId,
      evalSkillId: "skill_from_job",
      mode: "official",
      repeats: 5,
      role: "candidate",
      createdAt: new Date().toISOString(),
    });
    expect(
      resolveRetryCostParams({
        runId,
        result: {
          evalSkillId: "skill_from_result",
          mode: "dry-run",
          repeats: 1,
        },
      }),
    ).toEqual({
      evalSkillId: "skill_from_job",
      mode: "official",
      repeats: 5,
    });
  });

  it("merges job mode/repeats with result skill when job skill missing (inject)", async () => {
    const { resolveRetryCostParams } = await import("./retryCostAdmission.js");
    expect(
      resolveRetryCostParams({
        runId: "injected",
        job: {
          runId: "injected",
          mode: "official",
          repeats: 2,
          createdAt: new Date().toISOString(),
        } as import("@skillevalator/core").JobManifest,
        result: {
          evalSkillId: "skill_from_result",
          mode: "dry-run",
          repeats: 9,
        },
      }),
    ).toEqual({
      evalSkillId: "skill_from_result",
      mode: "official",
      repeats: 2,
    });
  });
});
