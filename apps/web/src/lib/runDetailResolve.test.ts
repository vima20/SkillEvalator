import { describe, expect, it } from "vitest";
import {
  RUN_DETAIL_FAILED_ERROR,
  RUN_DETAIL_INVALID_REQUEST_ERROR,
  RUN_DETAIL_NOT_FOUND_ERROR,
  knownRunDetailGetErrorCodes,
  resolveRunDetailGetError,
  resolveRunDetailHttpError,
} from "./runDetailResolve.js";

describe("resolveRunDetailGetError", () => {
  it("fail-closes known codes without body.error", () => {
    expect(
      resolveRunDetailGetError({ errorCode: "run_detail_not_found" }),
    ).toBe(RUN_DETAIL_NOT_FOUND_ERROR);
    expect(
      resolveRunDetailGetError({ errorCode: "run_detail_invalid_request" }),
    ).toBe(RUN_DETAIL_INVALID_REQUEST_ERROR);
    expect(
      resolveRunDetailGetError({ errorCode: "run_detail_failed" }),
    ).toBe(RUN_DETAIL_FAILED_ERROR);
  });

  it("maps short API not found to unlock-friendly copy", () => {
    expect(resolveRunDetailGetError({ error: "not found" })).toBe(
      RUN_DETAIL_NOT_FOUND_ERROR,
    );
  });

  it("prefers body.error when specific", () => {
    expect(
      resolveRunDetailGetError({
        errorCode: "run_detail_failed",
        error: "EPERM read status",
      }),
    ).toBe("EPERM read status");
  });

  it("uses HTTP status helper", () => {
    expect(resolveRunDetailHttpError(503)).toBe(
      "Could not refresh run status (HTTP 503).",
    );
  });

  it("lists known codes", () => {
    expect(knownRunDetailGetErrorCodes()).toEqual([
      "run_detail_not_found",
      "run_detail_invalid_request",
      "run_detail_failed",
    ]);
  });

  it("route and RunDetailClient use runDetailResolve", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    const route = fs.readFileSync(
      path.join(cwd, "src/app/api/runs/[runId]/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/run_detail_not_found/);
    expect(route).toMatch(/run_detail_failed/);
    expect(route).toMatch(/RUN_DETAIL_NOT_FOUND_API_ERROR/);
    const client = fs.readFileSync(
      path.join(cwd, "src/app/runs/[runId]/RunDetailClient.tsx"),
      "utf8",
    );
    expect(client).toMatch(/resolveRunDetailGetError/);
    expect(client).toMatch(/resolveRunDetailHttpError/);
    expect(client).not.toMatch(/setPollError\("Run not found\."\)/);
  });
});
