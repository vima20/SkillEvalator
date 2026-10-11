import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findReusableRetryRunId,
  saveRetryMarker,
  shouldReuseRetry,
} from "./retryDedup.js";
import { writeJsonFile } from "./fsJson.js";

const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("shouldReuseRetry", () => {
  it("reuses fresh queued child", () => {
    expect(
      shouldReuseRetry({
        markerAtMs: Date.now() - 1_000,
        nowMs: Date.now(),
        childStatus: "queued",
      }),
    ).toBe(true);
  });

  it("rejects expired marker", () => {
    expect(
      shouldReuseRetry({
        markerAtMs: Date.now() - 120_000,
        nowMs: Date.now(),
        childStatus: "queued",
      }),
    ).toBe(false);
  });

  it("rejects finished child", () => {
    expect(
      shouldReuseRetry({
        markerAtMs: Date.now() - 1_000,
        nowMs: Date.now(),
        childStatus: "failed",
      }),
    ).toBe(false);
  });
});

describe("findReusableRetryRunId", () => {
  it("returns child run when marker is valid", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-"));
    temps.push(root);
    const from = "run_100_fromaaaa";
    const child = "run_100_childbbb";
    writeJsonFile(path.join(root, from, "status.json"), {
      runId: from,
      status: "failed",
    });
    saveRetryMarker(root, from, child);
    writeJsonFile(path.join(root, child, "status.json"), {
      runId: child,
      status: "queued",
    });

    const reused = findReusableRetryRunId(root, from, (id) => {
      const p = path.join(root, id, "status.json");
      if (!fs.existsSync(p)) return undefined;
      return (
        JSON.parse(fs.readFileSync(p, "utf8")) as { status?: string }
      ).status;
    });
    expect(reused).toBe(child);
  });
});
