import { describe, expect, it } from "vitest";
import {
  PREFLIGHT_FAILED_FALLBACK,
  PREFLIGHT_NETWORK_ERROR,
  SETTINGS_REFRESH_FAILED_FALLBACK,
  SETTINGS_REFRESH_NETWORK_ERROR,
  SETTINGS_REFRESH_UNEXPECTED_PAYLOAD,
  resolvePreflightFetchError,
  resolveSettingsRefreshError,
} from "./preflightSettingsResolve.js";

describe("resolvePreflightFetchError", () => {
  it("maps http, network, and fallback", () => {
    expect(resolvePreflightFetchError("http", 500)).toBe(
      "Preflight failed (HTTP 500).",
    );
    expect(resolvePreflightFetchError("network")).toBe(PREFLIGHT_NETWORK_ERROR);
    expect(resolvePreflightFetchError("failed")).toBe(PREFLIGHT_FAILED_FALLBACK);
  });
});

describe("resolveSettingsRefreshError", () => {
  it("maps http, network, unexpected payload, and fallback", () => {
    expect(resolveSettingsRefreshError("http", 503)).toBe(
      "Settings refresh failed (503)",
    );
    expect(resolveSettingsRefreshError("network")).toBe(
      SETTINGS_REFRESH_NETWORK_ERROR,
    );
    expect(resolveSettingsRefreshError("unexpected_payload")).toBe(
      SETTINGS_REFRESH_UNEXPECTED_PAYLOAD,
    );
    expect(resolveSettingsRefreshError("failed")).toBe(
      SETTINGS_REFRESH_FAILED_FALLBACK,
    );
  });
});

describe("preflight/settings source locks", () => {
  it("NewRunForm and SettingsClient use resolvers", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    const form = fs.readFileSync(
      path.join(cwd, "src/app/NewRunForm.tsx"),
      "utf8",
    );
    expect(form).toMatch(/resolvePreflightFetchError/);
    expect(form).toMatch(/tryResolveAuthApiError/);
    expect(form).not.toMatch(/Preflight network error — is the web server up\?/);
    const settings = fs.readFileSync(
      path.join(cwd, "src/app/settings/SettingsClient.tsx"),
      "utf8",
    );
    expect(settings).toMatch(/resolveSettingsRefreshError/);
    expect(settings).toMatch(/tryResolveAuthApiError/);
    expect(settings).toMatch(/resolveSettingsRefreshError\("network"\)/);
    expect(settings).not.toMatch(/Settings refresh failed \(\$\{/);
    expect(settings).not.toMatch(/Failed to fetch/);
    // Ready CTA must open New run in official mode (not silent dry-run).
    expect(settings).toMatch(/Start official baseline↔candidate/);
    expect(settings).toMatch(/withNewRunHandoff\(true,\s*true\)/);
  });
});
