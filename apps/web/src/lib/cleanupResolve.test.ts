import { describe, expect, it } from "vitest";
import {
  CLEANUP_FAILED_ERROR,
  CLEANUP_INVALID_REQUEST_ERROR,
  knownCleanupPostErrorCodes,
  resolveCleanupPostError,
} from "./cleanupResolve.js";

describe("resolveCleanupPostError", () => {
  it("fail-closes known codes without body.error", () => {
    expect(
      resolveCleanupPostError({ errorCode: "cleanup_invalid_request" }),
    ).toBe(CLEANUP_INVALID_REQUEST_ERROR);
    expect(resolveCleanupPostError({ errorCode: "cleanup_failed" })).toBe(
      CLEANUP_FAILED_ERROR,
    );
    expect(resolveCleanupPostError({})).toBe(CLEANUP_FAILED_ERROR);
  });

  it("prefers body.error when provided", () => {
    expect(
      resolveCleanupPostError({
        errorCode: "cleanup_failed",
        error: "EPERM: unlink denied",
      }),
    ).toBe("EPERM: unlink denied");
  });

  it("lists known codes", () => {
    expect(knownCleanupPostErrorCodes()).toEqual([
      "cleanup_invalid_request",
      "cleanup_failed",
    ]);
  });

  it("cleanup route and Clear* clients use cleanupResolve", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    const route = fs.readFileSync(
      path.join(cwd, "src/app/api/runs/cleanup/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/cleanup_invalid_request/);
    expect(route).toMatch(/cleanup_failed/);
    expect(route).toMatch(/CLEANUP_INVALID_REQUEST_ERROR/);
    for (const rel of [
      "src/components/ClearOldRuns.tsx",
      "src/components/ClearSmokeNoise.tsx",
    ]) {
      const src = fs.readFileSync(path.join(cwd, rel), "utf8");
      expect(src).toMatch(/resolveCleanupPostError/);
      expect(src).toMatch(
        /resolveCleanupPostError\(\{\s*errorCode:\s*"cleanup_failed"/,
      );
      expect(src).not.toMatch(/Failed to fetch/);
    }
  });
});
