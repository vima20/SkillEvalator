import { describe, expect, it } from "vitest";
import {
  AUTH_INVALID_REQUEST_ERROR,
  AUTH_INVALID_TOKEN_ERROR,
  AUTH_MISCONFIGURED_API_ERROR,
  AUTH_MISCONFIGURED_ERROR,
  AUTH_PROBE_FAILED_ERROR,
  AUTH_UNAUTHORIZED_API_ERROR,
  AUTH_UNAUTHORIZED_ERROR,
  AUTH_UNLOCK_FAILED,
  AUTH_UNREACHABLE_ERROR,
  knownAuthPostErrorCodes,
  resolveAuthClientError,
  resolveAuthPostError,
  tryResolveAuthApiError,
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

  it("maps short middleware unauthorized literal to session copy", () => {
    expect(
      resolveAuthPostError({
        errorCode: "auth_unauthorized",
        error: AUTH_UNAUTHORIZED_API_ERROR,
      }),
    ).toBe(AUTH_UNAUTHORIZED_ERROR);
  });
});

describe("tryResolveAuthApiError", () => {
  it("resolves middleware auth JSON and ignores domain bodies", () => {
    expect(
      tryResolveAuthApiError({
        errorCode: "auth_misconfigured",
        misconfigured: true,
        error: AUTH_MISCONFIGURED_API_ERROR,
      }),
    ).toBe(AUTH_MISCONFIGURED_ERROR);
    expect(
      tryResolveAuthApiError({
        errorCode: "auth_unauthorized",
        error: AUTH_UNAUTHORIZED_API_ERROR,
      }),
    ).toBe(AUTH_UNAUTHORIZED_ERROR);
    expect(
      tryResolveAuthApiError({ errorCode: "export_failed" }),
    ).toBeNull();
    expect(tryResolveAuthApiError({})).toBeNull();
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
    expect(gate).toMatch(/tryResolveAuthApiError/);
    expect(gate).toMatch(/applyFailedProbe/);
    expect(gate).toMatch(/AUTH_MISCONFIGURED_ERROR/);
    expect(gate).toMatch(/AUTH_GATE_MISCONFIGURED_TITLE/);
    expect(gate).toMatch(/AUTH_GATE_PROBE_FAILED_TITLE/);
    expect(gate).toMatch(/AUTH_GATE_UNLOCK_TITLE/);
    expect(gate).toMatch(/resolveAuthClientError\("unreachable"\)/);
    expect(gate).not.toMatch(/unauthorized/);
    expect(gate).not.toMatch(/Failed to fetch/);
    expect(gate).not.toMatch(/err\.message/);
    expect(gate).not.toMatch(/"WEB_AUTH_TOKEN misconfigured"/);
  });

  it("middleware API JSON emits auth_misconfigured and auth_unauthorized", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const mw = fs.readFileSync(
      path.join(process.cwd(), "src/middleware.ts"),
      "utf8",
    );
    expect(mw).toMatch(/AUTH_MISCONFIGURED_API_ERROR/);
    expect(mw).toMatch(/AUTH_UNAUTHORIZED_API_ERROR/);
    expect(mw).toMatch(/errorCode:\s*"auth_misconfigured"/);
    expect(mw).toMatch(/errorCode:\s*"auth_unauthorized"/);
    expect(mw).not.toMatch(
      /error:\s*"WEB_AUTH_TOKEN misconfigured \(empty or whitespace only\)"/,
    );
    expect(mw).not.toMatch(/error:\s*"unauthorized"/);
  });

  it("AuthLock only reloads after successful DELETE", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/AuthLock.tsx"),
      "utf8",
    );
    expect(src).toMatch(/resolveAuthClientError\("unreachable"\)/);
    expect(src).toMatch(/if\s*\(\s*!res\.ok\s*\)/);
    expect(src).toMatch(/window\.location\.reload\(\)/);
    expect(src).not.toMatch(/\.finally\s*\(\s*\(\)\s*=>\s*\{?\s*window\.location\.reload/);
  });

  it("apiFetch and protected clients use tryResolveAuthApiError", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    const apiFetchSrc = fs.readFileSync(
      path.join(cwd, "src/lib/apiFetch.ts"),
      "utf8",
    );
    expect(apiFetchSrc).toMatch(/tryResolveAuthApiError/);
    for (const rel of [
      "src/app/NewRunForm.tsx",
      "src/app/settings/SettingsClient.tsx",
      "src/app/runs/[runId]/RunDetailClient.tsx",
      "src/lib/exportDownload.ts",
      "src/components/ClearOldRuns.tsx",
      "src/components/ClearSmokeNoise.tsx",
    ]) {
      const src = fs.readFileSync(path.join(cwd, rel), "utf8");
      expect(src).toMatch(/tryResolveAuthApiError/);
    }
    const runDetail = fs.readFileSync(
      path.join(cwd, "src/app/runs/[runId]/RunDetailClient.tsx"),
      "utf8",
    );
    expect(runDetail).toMatch(
      /tryResolveAuthApiError\(body\) \?\?\s*resolveRetryPostError/,
    );
    expect(runDetail).toMatch(
      /tryResolveAuthApiError\(body\) \?\?\s*resolveCancelPostError/,
    );
    const form = fs.readFileSync(
      path.join(cwd, "src/app/NewRunForm.tsx"),
      "utf8",
    );
    expect(form).toMatch(
      /tryResolveAuthApiError\(data\) \?\?\s*resolveEnqueuePostError/,
    );
    expect(form).toMatch(
      /tryResolveAuthApiError\(data\) \?\?\s*resolveSkillImportPostError/,
    );
  });
});
