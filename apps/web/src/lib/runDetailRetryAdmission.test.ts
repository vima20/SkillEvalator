import { describe, expect, it } from "vitest";
import { computeRunDetailRetryAdmission } from "./runDetailRetryAdmission.js";

const okCost = { blocked: false, reason: null };

describe("computeRunDetailRetryAdmission", () => {
  it("allows settled dry-run when preflight green and under cap", () => {
    expect(
      computeRunDetailRetryAdmission({
        status: "failed",
        hasLiveJob: false,
        mode: "dry-run",
        evaluationId: null,
        preflightOk: true,
        pilotBlockers: [],
        costAdmission: okCost,
        webAuthKind: "open",
        requireWebAuthConfigured: false,
        env: { FAKE_PRODUCE: "known-good" },
      }),
    ).toEqual({ canRetry: true, blockedReason: null });
  });

  it("blocks live job wind-down", () => {
    const out = computeRunDetailRetryAdmission({
      status: "budget_stop",
      hasLiveJob: true,
      mode: "dry-run",
      preflightOk: true,
      pilotBlockers: [],
      costAdmission: okCost,
      webAuthKind: "open",
      requireWebAuthConfigured: false,
    });
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/still finishing/i);
  });

  it("blocks budgetStopping even without live job file", () => {
    const out = computeRunDetailRetryAdmission({
      status: "budget_stop",
      hasLiveJob: false,
      budgetStopping: true,
      mode: "dry-run",
      preflightOk: true,
      pilotBlockers: [],
      costAdmission: okCost,
      webAuthKind: "open",
      requireWebAuthConfigured: false,
    });
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/still finishing/i);
  });

  it("blocks insufficient_quota", () => {
    const out = computeRunDetailRetryAdmission({
      status: "failed",
      errorCode: "insufficient_quota",
      hasLiveJob: false,
      mode: "dry-run",
      preflightOk: true,
      pilotBlockers: [],
      costAdmission: okCost,
      webAuthKind: "open",
      requireWebAuthConfigured: false,
    });
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/credits/i);
  });

  it("blocks when preflight not ok", () => {
    const out = computeRunDetailRetryAdmission({
      status: "failed",
      hasLiveJob: false,
      mode: "dry-run",
      preflightOk: false,
      pilotBlockers: [],
      costAdmission: okCost,
      webAuthKind: "open",
      requireWebAuthConfigured: false,
    });
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/preflight/i);
  });

  it("blocks official when Settings not Ready", () => {
    const out = computeRunDetailRetryAdmission({
      status: "failed",
      hasLiveJob: false,
      mode: "official",
      evaluationId: "eval_1",
      preflightOk: true,
      pilotBlockers: ["FAKE_PRODUCE=known-good — unset for official live pilot"],
      costAdmission: okCost,
      webAuthKind: "required",
      requireWebAuthConfigured: false,
      env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
    });
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/Settings not Ready/i);
  });

  it("blocks official without evaluationId", () => {
    const out = computeRunDetailRetryAdmission({
      status: "failed",
      hasLiveJob: false,
      mode: "official",
      evaluationId: null,
      preflightOk: true,
      pilotBlockers: [],
      costAdmission: okCost,
      webAuthKind: "required",
      requireWebAuthConfigured: false,
      env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
    });
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/evaluation/i);
  });

  it("blocks when cost admission denied", () => {
    const out = computeRunDetailRetryAdmission({
      status: "budget_stop",
      hasLiveJob: false,
      mode: "dry-run",
      preflightOk: true,
      pilotBlockers: [],
      costAdmission: {
        blocked: true,
        reason: "Per-leg estimate exceeds the $0.01 USD hard-stop",
        errorCode: "enqueue_cost_over_cap",
        costCapUsd: 0.01,
      },
      webAuthKind: "open",
      requireWebAuthConfigured: false,
    });
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/hard-stop/i);
  });

  it("returns null reason for non-retryable status", () => {
    expect(
      computeRunDetailRetryAdmission({
        status: "running",
        hasLiveJob: true,
        mode: "dry-run",
        preflightOk: true,
        pilotBlockers: [],
        costAdmission: okCost,
        webAuthKind: "open",
        requireWebAuthConfigured: false,
      }),
    ).toEqual({ canRetry: false, blockedReason: null });
  });
});
