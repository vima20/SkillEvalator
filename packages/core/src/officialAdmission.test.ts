import { describe, expect, it } from "vitest";
import { officialEnqueueAllowed } from "./officialAdmission.js";

describe("officialEnqueueAllowed", () => {
  it("allows dry-run even with smoke harness", () => {
    expect(
      officialEnqueueAllowed({
        mode: "dry-run",
        env: { FAKE_PRODUCE: "known-good" },
      }).ok,
    ).toBe(true);
  });

  it("rejects official when FAKE_PRODUCE=known-good", () => {
    const out = officialEnqueueAllowed({
      mode: "official",
      env: {
        FAKE_PRODUCE: "known-good",
        OPENAI_API_KEY: "sk-test",
      },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.errorCode).toBe("official_smoke_forbidden");
  });

  it("rejects official without API key", () => {
    const out = officialEnqueueAllowed({
      mode: "official",
      env: { FAKE_PRODUCE: "", OPENAI_API_KEY: "" },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(503);
    expect(out.errorCode).toBe("official_api_key_missing");
  });

  it("allows official with live key and no smoke", () => {
    expect(
      officialEnqueueAllowed({
        mode: "official",
        env: { OPENAI_API_KEY: "sk-live" },
      }).ok,
    ).toBe(true);
  });

  it("rejects official when WEB_AUTH required but open", () => {
    const out = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "sk-live" },
      requireWebAuthConfigured: true,
      webAuthOpen: true,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("official_web_auth_required");
  });

  it("rejects official single-leg enqueue (withBaseline false)", () => {
    const out = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "sk-live" },
      withBaseline: false,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.errorCode).toBe("official_pair_required");
  });

  it("allows official paired enqueue (withBaseline true)", () => {
    expect(
      officialEnqueueAllowed({
        mode: "official",
        env: { OPENAI_API_KEY: "sk-live" },
        withBaseline: true,
      }).ok,
    ).toBe(true);
  });

  it("allows dry-run single-leg", () => {
    expect(
      officialEnqueueAllowed({
        mode: "dry-run",
        env: { OPENAI_API_KEY: "sk-live" },
        withBaseline: false,
      }).ok,
    ).toBe(true);
  });
});
