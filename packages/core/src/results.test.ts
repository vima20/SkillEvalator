import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatRunError,
  isNonRetryableErrorCode,
  purgeTerminalRunsFs,
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
