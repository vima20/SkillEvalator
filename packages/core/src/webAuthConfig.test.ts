import { describe, expect, it } from "vitest";
import { resolveWebAuthConfig } from "./webAuthConfig.js";

describe("resolveWebAuthConfig", () => {
  it("unset → open", () => {
    expect(resolveWebAuthConfig(undefined)).toEqual({ kind: "open" });
  });

  it("empty/whitespace → misconfigured", () => {
    expect(resolveWebAuthConfig("")).toEqual({ kind: "misconfigured" });
    expect(resolveWebAuthConfig("   ")).toEqual({ kind: "misconfigured" });
    expect(resolveWebAuthConfig("\t\n")).toEqual({ kind: "misconfigured" });
  });

  it("trims non-empty token → required", () => {
    expect(resolveWebAuthConfig("  secret  ")).toEqual({
      kind: "required",
      token: "secret",
    });
  });
});
