import { describe, expect, it } from "vitest";
import { formatRetryCostBlockedReason } from "./retryCostAdmissionCopy.js";
import {
  retryCostAdmissionFromGate,
  resolveRetryCostParams,
} from "./retryCostAdmission.js";

describe("formatRetryCostBlockedReason / retryCostAdmissionFromGate", () => {
  it("maps deny gate to New run cost-cap copy", () => {
    const out = retryCostAdmissionFromGate({
      ok: false,
      status: 400,
      errorCode: "enqueue_cost_over_cap",
      estimatedUsd: 1.25,
      costCapUsd: 0.5,
      error: "per-leg estimate $1.2500 exceeds COST_CAP_USD $0.5",
    });
    expect(out.blocked).toBe(true);
    expect(out.errorCode).toBe("enqueue_cost_over_cap");
    expect(out.estimatedUsd).toBe(1.25);
    expect(out.costCapUsd).toBe(0.5);
    expect(out.reason).toBe(formatRetryCostBlockedReason(0.5));
    expect(out.reason).toMatch(/COST_CAP_USD/);
  });

  it("maps ok gate to not blocked", () => {
    expect(retryCostAdmissionFromGate({ ok: true })).toEqual({
      blocked: false,
      reason: null,
    });
  });
});

describe("resolveRetryCostParams", () => {
  it("prefers result skill/mode/repeats", () => {
    expect(
      resolveRetryCostParams({
        runId: "no-such-run-for-cost-params",
        result: {
          evalSkillId: "code-debugging-eval",
          mode: "official",
          repeats: 3,
        },
      }),
    ).toEqual({
      evalSkillId: "code-debugging-eval",
      mode: "official",
      repeats: 3,
    });
  });

  it("falls back to status.repeats when result omits repeats", () => {
    expect(
      resolveRetryCostParams({
        runId: "no-such-run-for-cost-params",
        result: {
          evalSkillId: "code-debugging-eval",
          mode: "dry-run",
        },
        status: { repeats: 2 },
      }),
    ).toEqual({
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      repeats: 2,
    });
  });

  it("returns null when mode is not enqueueable and no job file", () => {
    expect(
      resolveRetryCostParams({
        runId: "no-such-run-for-cost-params",
        result: {
          evalSkillId: "code-debugging-eval",
          mode: "unknown",
          repeats: 1,
        },
      }),
    ).toBeNull();
  });
});
