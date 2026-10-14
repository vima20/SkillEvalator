import { describe, expect, it } from "vitest";
import {
  bearerCredential,
  parseSeAuthCookie,
  resolveWebAuthConfig,
  timingSafeEqualUtf8,
  webAuthMatches,
} from "./webAuth.js";

describe("resolveWebAuthConfig", () => {
  it("is open when env is unset", () => {
    expect(resolveWebAuthConfig(undefined)).toEqual({ kind: "open" });
  });

  it("is misconfigured when env is empty or whitespace-only", () => {
    expect(resolveWebAuthConfig("")).toEqual({ kind: "misconfigured" });
    expect(resolveWebAuthConfig("   ")).toEqual({ kind: "misconfigured" });
    expect(resolveWebAuthConfig("\t\n")).toEqual({ kind: "misconfigured" });
  });

  it("is required when env has a non-empty token after trim", () => {
    expect(resolveWebAuthConfig("  secret  ")).toEqual({
      kind: "required",
      token: "secret",
    });
  });
});

describe("timingSafeEqualUtf8", () => {
  it("accepts equal strings", async () => {
    expect(await timingSafeEqualUtf8("secret", "secret")).toBe(true);
  });

  it("rejects unequal strings of equal length", async () => {
    expect(await timingSafeEqualUtf8("secret", "secreT")).toBe(false);
  });

  it("rejects unequal lengths without throwing", async () => {
    expect(await timingSafeEqualUtf8("ab", "abcd")).toBe(false);
  });
});

describe("bearerCredential", () => {
  it("parses Bearer tokens", () => {
    expect(bearerCredential("Bearer tok-1")).toBe("tok-1");
    expect(bearerCredential("bearer tok-1")).toBe("tok-1");
  });

  it("rejects malformed headers", () => {
    expect(bearerCredential(null)).toBeNull();
    expect(bearerCredential("Basic x")).toBeNull();
    expect(bearerCredential("Bearer")).toBeNull();
  });
});

describe("parseSeAuthCookie", () => {
  it("reads and decodes se_auth", () => {
    expect(parseSeAuthCookie("a=1; se_auth=hello%2Fworld; b=2")).toBe(
      "hello/world",
    );
  });

  it("returns empty when missing", () => {
    expect(parseSeAuthCookie(null)).toBe("");
    expect(parseSeAuthCookie("other=1")).toBe("");
  });

  it("keeps raw value when decodeURIComponent throws", () => {
    // Malformed % sequences must not diverge middleware vs /api/auth GET.
    expect(parseSeAuthCookie("se_auth=tok%E0")).toBe("tok%E0");
  });

  it("uses the last se_auth when duplicates appear", () => {
    expect(parseSeAuthCookie("se_auth=stale; se_auth=fresh")).toBe("fresh");
    expect(parseSeAuthCookie("se_auth=a; other=1; se_auth=b%2Fc")).toBe("b/c");
  });
});

describe("webAuthMatches", () => {
  it("matches cookie or Bearer", async () => {
    expect(
      await webAuthMatches({
        expected: "tok",
        cookie: "tok",
        authorization: null,
      }),
    ).toBe(true);
    expect(
      await webAuthMatches({
        expected: "tok",
        cookie: "",
        authorization: "Bearer tok",
      }),
    ).toBe(true);
  });

  it("trims expected and cookie before compare", async () => {
    expect(
      await webAuthMatches({
        expected: "  tok  ",
        cookie: "tok",
        authorization: null,
      }),
    ).toBe(true);
  });

  it("never bypasses on empty or whitespace expected", async () => {
    expect(
      await webAuthMatches({
        expected: "",
        cookie: "anything",
        authorization: null,
      }),
    ).toBe(false);
    expect(
      await webAuthMatches({
        expected: "   ",
        cookie: "   ",
        authorization: null,
      }),
    ).toBe(false);
  });

  it("rejects wrong credentials", async () => {
    expect(
      await webAuthMatches({
        expected: "tok",
        cookie: "nope",
        authorization: "Bearer nope",
      }),
    ).toBe(false);
  });
});
