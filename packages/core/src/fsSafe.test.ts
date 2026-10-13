import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  QUEUE_CLAIM_LOCK_STALE_MS,
  assertRealDirectory,
  readRegularFileUtf8,
  releaseWxLock,
  tryAcquireQueueClaimLock,
  tryAcquireWxLock,
  tryReadRegularFileUtf8,
} from "./fsSafe.js";

const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("fsSafe", () => {
  it("reads a regular file and rejects a symlink", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-fssafe-"));
    temps.push(root);
    const real = path.join(root, "real.txt");
    const link = path.join(root, "link.txt");
    fs.writeFileSync(real, "ok\n", "utf8");
    expect(readRegularFileUtf8(real)).toBe("ok\n");

    try {
      fs.symlinkSync(real, link);
    } catch {
      return;
    }
    expect(() => readRegularFileUtf8(link, "link")).toThrow(/symlink/i);
    expect(tryReadRegularFileUtf8(link)).toBeNull();
  });

  it("rejects a directory symlink", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-fsdir-"));
    temps.push(root);
    const realDir = path.join(root, "real");
    const linkDir = path.join(root, "link");
    fs.mkdirSync(realDir);
    fs.writeFileSync(path.join(realDir, "a.txt"), "x", "utf8");
    assertRealDirectory(realDir, "real");

    try {
      fs.symlinkSync(realDir, linkDir, "dir");
    } catch {
      return;
    }
    expect(() => assertRealDirectory(linkDir, "subject")).toThrow(/symlink/i);
  });

  it("acquires and releases a wx lock", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-fslock-"));
    temps.push(root);
    const lock = path.join(root, "x.lock");
    expect(tryAcquireWxLock(lock, { retries: 0 })).toBe(true);
    expect(tryAcquireWxLock(lock, { retries: 0, staleMs: 60_000 })).toBe(false);
    releaseWxLock(lock);
    expect(tryAcquireWxLock(lock, { retries: 0 })).toBe(true);
    releaseWxLock(lock);
  });

  it("steals a stale lock via unlink+wx", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-fstale-"));
    temps.push(root);
    const lock = path.join(root, "x.lock");
    fs.writeFileSync(lock, "1", "utf8");
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(lock, past, past);
    expect(tryAcquireWxLock(lock, { retries: 0, staleMs: 30_000 })).toBe(true);
    releaseWxLock(lock);
  });

  it("queue claim steals stale age locks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-qclaim-"));
    temps.push(root);
    const lock = path.join(root, ".lock");
    fs.writeFileSync(lock, String(Date.now()), "utf8");
    const past = new Date(Date.now() - QUEUE_CLAIM_LOCK_STALE_MS - 5_000);
    fs.utimesSync(lock, past, past);
    expect(tryAcquireQueueClaimLock(lock)).toBe(true);
    releaseWxLock(lock);
  });

  it("queue claim steals a fresh dead legacy PID lock", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-qpid-"));
    temps.push(root);
    const lock = path.join(root, ".lock");
    fs.writeFileSync(lock, "424242", "utf8");
    expect(
      tryAcquireQueueClaimLock(lock, { isPidAlive: () => false }),
    ).toBe(true);
    releaseWxLock(lock);
  });

  it("queue claim keeps a fresh live PID lock", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-qlive-"));
    temps.push(root);
    const lock = path.join(root, ".lock");
    fs.writeFileSync(lock, "12345", "utf8");
    expect(
      tryAcquireQueueClaimLock(lock, { isPidAlive: () => true }),
    ).toBe(false);
  });

  it("queue claim does not treat timestamp locks as PIDs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-qts-"));
    temps.push(root);
    const lock = path.join(root, ".lock");
    fs.writeFileSync(lock, String(Date.now()), "utf8");
    expect(
      tryAcquireQueueClaimLock(lock, {
        staleMs: 60_000,
        isPidAlive: () => false,
      }),
    ).toBe(false);
  });
});
