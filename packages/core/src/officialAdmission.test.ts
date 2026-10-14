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
      webAuthKind: "open",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("official_web_auth_required");
  });

  it("rejects official when WEB_AUTH required but misconfigured", () => {
    const out = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "sk-live" },
      requireWebAuthConfigured: true,
      webAuthKind: "misconfigured",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("official_web_auth_required");
    expect(out.error).toMatch(/misconfigured|non-empty/i);
  });

  it("allows official when WEB_AUTH required and kind=required", () => {
    expect(
      officialEnqueueAllowed({
        mode: "official",
        env: { OPENAI_API_KEY: "sk-live" },
        requireWebAuthConfigured: true,
        webAuthKind: "required",
        withBaseline: true,
        repeats: 3,
      }).ok,
    ).toBe(true);
  });

  it("rejects official when repeats below floor", () => {
    const out = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "sk-live" },
      withBaseline: true,
      repeats: 1,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("official_repeats_too_low");
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

  it("rejects official worker job without evaluationId", () => {
    const out = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "sk-live" },
      requireEvaluationId: true,
      evaluationId: "",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("official_evaluation_required");
  });

  it("allows official worker job with evaluationId", () => {
    expect(
      officialEnqueueAllowed({
        mode: "official",
        env: { OPENAI_API_KEY: "sk-live" },
        requireEvaluationId: true,
        evaluationId: "eval_abc",
      }).ok,
    ).toBe(true);
  });
});
