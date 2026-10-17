import { describe, expect, it } from "vitest";
import {
  AUTH_INVALID_REQUEST_ERROR,
  AUTH_INVALID_TOKEN_ERROR,
  AUTH_MISCONFIGURED_API_ERROR,
  AUTH_MISCONFIGURED_ERROR,
  AUTH_PROBE_FAILED_ERROR,
  AUTH_UNAUTHORIZED_ERROR,
  AUTH_UNLOCK_FAILED,
  AUTH_UNREACHABLE_ERROR,
  knownAuthPostErrorCodes,
  resolveAuthClientError,
  resolveAuthPostError,
} from "./authResolve.js";

describe("resolveAuthPostError", () => {
  it("fail-closes known codes without body.error", () => {
    expect(
      resolveAuthPostError({ errorCode: "auth_misconfigured" }),
    ).toBe(AUTH_MISCONFIGURED_ERROR);
    expect(
      resolveAuthPostError({ errorCode: "auth_invalid_token" }),
    ).toBe(AUTH_INVALID_TOKEN_ERROR);
    expect(
      resolveAuthPostError({ errorCode: "auth_invalid_request" }),
    ).toBe(AUTH_INVALID_REQUEST_ERROR);
    expect(
      resolveAuthPostError({ errorCode: "auth_unauthorized" }),
    ).toBe(AUTH_UNAUTHORIZED_ERROR);
    expect(resolveAuthPostError({})).toBe(AUTH_UNLOCK_FAILED);
  });

  it("maps misconfigured flag and short API literal to unlock guidance", () => {
    expect(resolveAuthPostError({ misconfigured: true })).toBe(
      AUTH_MISCONFIGURED_ERROR,
    );
    expect(
      resolveAuthPostError({
        errorCode: "auth_misconfigured",
        error: AUTH_MISCONFIGURED_API_ERROR,
      }),
    ).toBe(AUTH_MISCONFIGURED_ERROR);
  });

  it("prefers body.error for invalid token", () => {
    expect(
      resolveAuthPostError({
        errorCode: "auth_invalid_token",
        error: "invalid token",
      }),
    ).toBe("invalid token");
  });
});

describe("resolveAuthClientError", () => {
  it("returns probe / unreachable copy", () => {
    expect(resolveAuthClientError("probe_failed")).toBe(AUTH_PROBE_FAILED_ERROR);
    expect(resolveAuthClientError("unreachable")).toBe(AUTH_UNREACHABLE_ERROR);
  });
});

describe("auth source locks", () => {
  it("lists known codes", () => {
    expect(knownAuthPostErrorCodes()).toEqual(
      expect.arrayContaining([
        "auth_misconfigured",
        "auth_invalid_token",
        "auth_invalid_request",
        "auth_unauthorized",
        "auth_probe_failed",
        "auth_unreachable",
      ]),
    );
  });

  it("POST /api/auth and AuthGate use authResolve", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    const route = fs.readFileSync(
      path.join(cwd, "src/app/api/auth/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/auth_misconfigured/);
    expect(route).toMatch(/auth_invalid_token/);
    expect(route).toMatch(/auth_invalid_request/);
    expect(route).toMatch(/AUTH_MISCONFIGURED_API_ERROR/);
    const gate = fs.readFileSync(
      path.join(cwd, "src/components/AuthGate.tsx"),
      "utf8",
    );
    expect(gate).toMatch(/resolveAuthPostError/);
    expect(gate).toMatch(/resolveAuthClientError/);
    expect(gate).toMatch(/AUTH_MISCONFIGURED_ERROR/);
    expect(gate).not.toMatch(/unauthorized/);
  });

  it("middleware API JSON emits auth_misconfigured and auth_unauthorized", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const mw = fs.readFileSync(
      path.join(process.cwd(), "src/middleware.ts"),
      "utf8",
    );
    expect(mw).toMatch(/errorCode:\s*"auth_misconfigured"/);
    expect(mw).toMatch(/errorCode:\s*"auth_unauthorized"/);
  });
});
