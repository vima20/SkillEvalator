import fs from "node:fs";
import path from "node:path";

/** Reject directory symlinks that would escape into the host tree. */
export function assertRealDirectory(
  dirPath: string,
  label = "directory",
): void {
  const st = fs.lstatSync(dirPath);
  if (st.isSymbolicLink()) {
    throw new Error(`symlink not allowed for ${label}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`${label} is not a directory`);
  }
}

/** Like assertRealDirectory, but no-op when the path does not exist. */
export function assertRealDirectoryIfExists(
  dirPath: string,
  label = "directory",
): void {
  if (!fs.existsSync(dirPath)) return;
  assertRealDirectory(dirPath, label);
}

/** Read only regular files; never follow symlinks into host secrets. */
export function readRegularFileUtf8(
  filePath: string,
  label = "file",
): string {
  const st = fs.lstatSync(filePath);
  if (st.isSymbolicLink()) {
    throw new Error(`symlink not allowed for ${label}`);
  }
  if (!st.isFile()) {
    throw new Error(`${label} is not a regular file`);
  }
  return fs.readFileSync(filePath, "utf8");
}

/** Like readRegularFileUtf8, but null when missing or not a regular file. */
export function tryReadRegularFileUtf8(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return readRegularFileUtf8(filePath);
  } catch {
    return null;
  }
}

/**
 * Exclusive wx lock with brief retry. Stale locks older than staleMs are stolen.
 * Returns whether the lock was acquired; caller must release via finally.
 */
export function tryAcquireWxLock(
  lockPath: string,
  opts?: { staleMs?: number; retries?: number; retryDelayMs?: number },
): boolean {
  const staleMs = opts?.staleMs ?? 60_000;
  const retries = opts?.retries ?? 25;
  const retryDelayMs = opts?.retryDelayMs ?? 20;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  for (let i = 0; i <= retries; i++) {
    const nowMs = Date.now();
    try {
      fs.writeFileSync(lockPath, String(nowMs), { flag: "wx" });
      return true;
    } catch {
      try {
        const age = nowMs - fs.statSync(lockPath).mtimeMs;
        if (age > staleMs) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            /* ignore */
          }
          try {
            fs.writeFileSync(lockPath, String(nowMs), { flag: "wx" });
            return true;
          } catch {
            /* lost race to another stealer — retry */
          }
        }
      } catch {
        /* ignore */
      }
      if (i < retries) sleepMs(retryDelayMs);
    }
  }
  return false;
}

export function releaseWxLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

/** Worker claim lock: held only for rename+pid write before produce/grade. */
export const QUEUE_CLAIM_LOCK_STALE_MS = 30_000;

/**
 * Queue claim lock: wx + age steal, plus immediate steal of a fresh legacy
 * PID lock when `isPidAlive` reports the holder is dead (≤8 digit pid text;
 * timestamp locks are 13 digits and are never treated as PIDs).
 */
export function tryAcquireQueueClaimLock(
  lockPath: string,
  opts?: {
    staleMs?: number;
    isPidAlive?: (pid: number) => boolean;
  },
): boolean {
  const staleMs = opts?.staleMs ?? QUEUE_CLAIM_LOCK_STALE_MS;
  if (tryAcquireWxLock(lockPath, { staleMs, retries: 5 })) {
    return true;
  }
  const isPidAlive = opts?.isPidAlive;
  if (!isPidAlive) return false;
  try {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    if (!/^\d{1,8}$/.test(raw)) return false;
    const pid = Number(raw);
    if (isPidAlive(pid)) return false;
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
    return tryAcquireWxLock(lockPath, { staleMs, retries: 2 });
  } catch {
    return false;
  }
}

function sleepMs(ms: number): void {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}
