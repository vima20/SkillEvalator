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
          fs.writeFileSync(lockPath, String(nowMs));
          return true;
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

function sleepMs(ms: number): void {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}
