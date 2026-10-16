import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  UnauthorizedError,
  unlockHrefFromLocation,
} from "./apiFetch.js";

describe("unlockHrefFromLocation", () => {
  it("preserves focus=pilot in next=", () => {
    expect(unlockHrefFromLocation("/comparison", "?focus=pilot")).toBe(
      "/unlock?next=%2Fcomparison%3Ffocus%3Dpilot",
    );
    expect(unlockHrefFromLocation("/runs", "")).toBe("/unlock?next=%2Fruns");
    expect(unlockHrefFromLocation("/", "?focus=pilot")).toBe("/unlock");
  });

  it("does not nest unlock redirects", () => {
    expect(unlockHrefFromLocation("/unlock", "?next=/runs")).toBe("/unlock");
  });
});

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns non-401 responses unchanged", async () => {
    const ok = new Response(JSON.stringify({ ok: true }), { status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ok),
    );
    const res = await apiFetch("/api/preflight");
    expect(res.status).toBe(200);
    expect(res).toBe(ok);
  });

  it("leaves /api/auth 401 alone (no unlock redirect)", async () => {
    const unauthorized = new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });
    const fetchMock = vi.fn().mockResolvedValue(unauthorized);
    const assign = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: {
        pathname: "/runs",
        search: "",
        assign,
      },
    });
    const res = await apiFetch("/api/auth");
    expect(res.status).toBe(401);
    expect(assign).not.toHaveBeenCalled();
  });

  it("redirects to unlock and throws on protected 401", async () => {
    const unauthorized = new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });
    const assign = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(unauthorized),
    );
    vi.stubGlobal("window", {
      location: {
        pathname: "/comparison",
        search: "?focus=pilot",
        assign,
      },
    });
    await expect(apiFetch("/api/runs")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(assign).toHaveBeenCalledWith(
      "/unlock?next=%2Fcomparison%3Ffocus%3Dpilot",
    );
  });
});
