import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatRunError,
  isNonRetryableErrorCode,
  purgeTerminalRunsFs,
  syncStatusFromResult,
} from "./results.js";
import { writeJsonFile } from "./fsJson.js";

const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("formatRunError", () => {
  it("extracts OpenAI-style nested error message and code", () => {
    const formatted = formatRunError({
      status: 429,
      message: "429 Rate limit",
      error: {
        message: "You have no credits remaining.",
        code: "insufficient_quota",
      },
    });
    expect(formatted.error).toContain("credits");
    expect(formatted.errorCode).toBe("insufficient_quota");
  });

  it("maps bare 429 without quota language to rate_limit", () => {
    const formatted = formatRunError({
      status: 429,
      message: "Rate limit reached",
      error: { message: "Rate limit reached", code: "rate_limit_exceeded" },
    });
    expect(formatted.errorCode).toBe("rate_limit_exceeded");
    expect(formatted.error.toLowerCase()).toContain("rate limit");
  });

  it("does not treat vague quota wording as no-credits", () => {
    const formatted = formatRunError({
      status: 429,
      message: "Please check your quota dashboard",
      error: {
        message: "Please check your quota dashboard",
        code: "rate_limit_exceeded",
      },
    });
    expect(formatted.errorCode).toBe("rate_limit_exceeded");
  });

  it("falls back to Error.message", () => {
    const formatted = formatRunError(new Error("boom"));
    expect(formatted.error).toBe("boom");
  });

  it("marks produce cancel", () => {
    const err = Object.assign(new Error("produce cancelled"), {
      name: "ProduceCancelledError",
      code: "cancelled",
    });
    expect(formatRunError(err).errorCode).toBe("cancelled");
  });
});

describe("isNonRetryableErrorCode", () => {
  it("blocks quota", () => {
    expect(isNonRetryableErrorCode("insufficient_quota")).toBe(true);
    expect(isNonRetryableErrorCode("rate_limit_exceeded")).toBe(false);
  });
});

describe("syncStatusFromResult", () => {
  it("heals running status when terminal result exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-sync-"));
    temps.push(root);
    const runId = "run_100_syncok";
    writeJsonFile(path.join(root, runId, "status.json"), {
      runId,
      status: "running",
    });
    writeJsonFile(path.join(root, runId, "result.json"), {
      runId,
      evalSkillId: "code-debugging-eval",
      evalSkillVersion: "abc",
      evalSkillGithubUrl:
        "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
      taskSetId: "cde-v1",
      taskIds: ["bug-01"],
      pipeline: { produce: "model", grade: "docker_script" },
      modelId: "gpt-4o-mini",
      decoding: { temperature: 0, top_p: 1 },
      repeats: 1,
      aggregate: "mean",
      perTask: [
        {
          taskId: "bug-01",
          scriptResults: [],
          score: 1,
          status: "ok",
        },
      ],
      score: 1,
      subscores: {},
      rationale: "",
      findings: [],
      costUsd: 0.02,
      latencyMs: 50,
      status: "ok",
      startedAt: "2026-01-01T00:00:00.000Z",
      mode: "dry-run",
    });

    const st = syncStatusFromResult(root, runId);
    expect(st?.status).toBe("ok");
    expect(st?.costUsd).toBe(0.02);
  });

  it("prefers terminal result over mismatched failed status", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-sync-mismatch-"));
    temps.push(root);
    const runId = "run_100_syncmismatch";
    writeJsonFile(path.join(root, runId, "status.json"), {
      runId,
      status: "failed",
      error: "benefit report write failed",
      errorCode: "internal",
    });
    writeJsonFile(path.join(root, runId, "result.json"), {
      runId,
      evalSkillId: "code-debugging-eval",
      evalSkillVersion: "abc",
      evalSkillGithubUrl:
        "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
      taskSetId: "cde-v1",
      taskIds: ["bug-01"],
      pipeline: { produce: "model", grade: "docker_script" },
      modelId: "gpt-4o-mini",
      decoding: { temperature: 0, top_p: 1 },
      repeats: 1,
      aggregate: "mean",
      perTask: [
        {
          taskId: "bug-01",
          scriptResults: [],
          score: 1,
          status: "ok",
        },
      ],
      score: 1,
      subscores: {},
      rationale: "",
      findings: [],
      costUsd: 0.03,
      latencyMs: 50,
      status: "ok",
      startedAt: "2026-01-01T00:00:00.000Z",
      mode: "dry-run",
    });

    const st = syncStatusFromResult(root, runId);
    expect(st?.status).toBe("ok");
    expect(st?.costUsd).toBe(0.03);
    expect(st?.error).toBeUndefined();
    expect(st?.errorCode).toBeUndefined();
  });

  it("heals cancel_requested when result is cancelled", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-sync-cancel-"));
    temps.push(root);
    const runId = "run_100_synccancel";
    writeJsonFile(path.join(root, runId, "status.json"), {
      runId,
      status: "cancel_requested",
    });
    writeJsonFile(path.join(root, runId, "result.json"), {
      runId,
      evalSkillId: "code-debugging-eval",
      evalSkillVersion: "abc",
      evalSkillGithubUrl:
        "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
      taskSetId: "cde-v1",
      taskIds: ["bug-01"],
      pipeline: { produce: "model", grade: "docker_script" },
      modelId: "gpt-4o-mini",
      decoding: { temperature: 0, top_p: 1 },
      repeats: 1,
      aggregate: "mean",
      perTask: [
        {
          taskId: "bug-01",
          scriptResults: [],
          score: null,
          status: "cancelled",
        },
      ],
      score: null,
      subscores: {},
      rationale: "",
      findings: ["cancelled"],
      costUsd: 0,
      latencyMs: 10,
      status: "cancelled",
      startedAt: "2026-01-01T00:00:00.000Z",
      mode: "dry-run",
    });

    const st = syncStatusFromResult(root, runId);
    expect(st?.status).toBe("cancelled");
  });
});

describe("purgeTerminalRunsFs", () => {
  it("removes only old terminal runs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-purge-"));
    temps.push(root);
    const resultsDir = path.join(root, "results");
    const jobsDir = path.join(root, "jobs");
    fs.mkdirSync(jobsDir, { recursive: true });

    const oldId = "run_100_oldterm";
    const freshId = "run_100_freshok";
    const runningId = "run_100_stillrun";

    writeJsonFile(path.join(resultsDir, oldId, "status.json"), {
      runId: oldId,
      status: "failed",
    });
    writeJsonFile(path.join(resultsDir, freshId, "status.json"), {
      runId: freshId,
      status: "ok",
    });
    writeJsonFile(path.join(resultsDir, runningId, "status.json"), {
      runId: runningId,
      status: "running",
    });
    fs.writeFileSync(path.join(jobsDir, `${oldId}.failed.json`), "{}");

    const oldStatus = path.join(resultsDir, oldId, "status.json");
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldStatus, past, past);

    const out = purgeTerminalRunsFs(resultsDir, jobsDir, {
      olderThanMs: 7 * 24 * 60 * 60 * 1000,
    });
    expect(out.removed).toEqual([oldId]);
    expect(fs.existsSync(path.join(resultsDir, oldId))).toBe(false);
    expect(fs.existsSync(path.join(resultsDir, freshId))).toBe(true);
    expect(fs.existsSync(path.join(resultsDir, runningId))).toBe(true);
    expect(fs.existsSync(path.join(jobsDir, `${oldId}.failed.json`))).toBe(
      false,
    );
  });
});
