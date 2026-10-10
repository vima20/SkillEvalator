import { describe, expect, it } from "vitest";
import {
  assertSafeId,
  isQueuedJobFile,
  normalizeRepeats,
  resolveUnder,
  statusBadgeKind,
} from "./index.js";
import path from "node:path";

describe("isQueuedJobFile", () => {
  it("accepts pending job files only", () => {
    expect(isQueuedJobFile("run_123_abcd.json")).toBe(true);
    expect(isQueuedJobFile("run_123_abcd.running.json")).toBe(false);
    expect(isQueuedJobFile("run_123_abcd.done.json")).toBe(false);
    expect(isQueuedJobFile("run_123_abcd.failed.json")).toBe(false);
    expect(isQueuedJobFile("run_123_abcd.tmp.json")).toBe(false);
    expect(isQueuedJobFile(".lock")).toBe(false);
  });
});

describe("assertSafeId / resolveUnder", () => {
  it("rejects traversal", () => {
    expect(() => assertSafeId("../etc")).toThrow();
    expect(() => assertSafeId("a/b")).toThrow();
    expect(() => resolveUnder("/tmp/root", "..", "etc")).toThrow();
  });

  it("resolves under root", () => {
    const root = path.resolve("/tmp/root");
    expect(resolveUnder(root, "run_1")).toBe(path.join(root, "run_1"));
  });
});

describe("normalizeRepeats", () => {
  it("enforces official minimum", () => {
    expect(normalizeRepeats("dry-run", 1)).toBe(1);
    expect(normalizeRepeats("official", 1)).toBe(3);
    expect(normalizeRepeats("official", 5)).toBe(5);
  });
});

describe("statusBadgeKind", () => {
  it("maps known statuses", () => {
    expect(statusBadgeKind("ok")).toBe("ok");
    expect(statusBadgeKind("queued")).toBe("run");
    expect(statusBadgeKind("failed")).toBe("fail");
    expect(statusBadgeKind("cancelled")).toBe("fail");
    expect(statusBadgeKind("budget_stop")).toBe("fail");
    expect(statusBadgeKind("mystery")).toBe("wait");
  });
});
