import { describe, expect, it } from "vitest";
import {
  benefitPendingState,
  comparisonPendingState,
  runIsActive,
} from "./status.js";

describe("runIsActive", () => {
  it("treats queued/running/cancel_requested as active", () => {
    expect(runIsActive("queued")).toBe(true);
    expect(runIsActive("running")).toBe(true);
    expect(runIsActive("cancel_requested")).toBe(true);
  });

  it("keeps budget_stop active only until result exists", () => {
    expect(runIsActive("budget_stop", false)).toBe(true);
    expect(runIsActive("budget_stop", true)).toBe(false);
  });

  it("treats missing and unknown as active without a result", () => {
    expect(runIsActive(undefined, false)).toBe(true);
    expect(runIsActive("", false)).toBe(true);
    expect(runIsActive("unknown", false)).toBe(true);
    expect(runIsActive("unknown", true)).toBe(false);
  });

  it("settles failed/cancelled/ok", () => {
    expect(runIsActive("failed")).toBe(false);
    expect(runIsActive("cancelled")).toBe(false);
    expect(runIsActive("ok")).toBe(false);
  });
});

describe("benefitPendingState", () => {
  it("polls while status is missing or unknown", () => {
    expect(benefitPendingState({ status: null, budgetTimedOut: false })).toEqual(
      {
        windDown: false,
        stillWaiting: true,
        unavailable: false,
      },
    );
    expect(
      benefitPendingState({ status: "unknown", budgetTimedOut: false }),
    ).toEqual({
      windDown: false,
      stillWaiting: true,
      unavailable: false,
    });
  });

  it("polls during budget_stop wind-down until orphan timeout", () => {
    expect(
      benefitPendingState({ status: "budget_stop", budgetTimedOut: false }),
    ).toEqual({
      windDown: true,
      stillWaiting: true,
      unavailable: false,
    });
    expect(
      benefitPendingState({ status: "budget_stop", budgetTimedOut: true }),
    ).toEqual({
      windDown: true,
      stillWaiting: false,
      unavailable: true,
    });
  });

  it("marks terminal statuses without result as unavailable", () => {
    for (const status of ["ok", "failed", "cancelled"] as const) {
      expect(
        benefitPendingState({ status, budgetTimedOut: false }),
      ).toEqual({
        windDown: false,
        stillWaiting: false,
        unavailable: true,
      });
    }
  });
});

describe("comparisonPendingState", () => {
  const idle = {
    status: undefined as string | undefined,
    hasResult: false,
    budgetTimedOut: false,
  };

  it("keeps polling while either leg is unknown without a result", () => {
    const g = comparisonPendingState({
      baseline: { ...idle, status: "unknown" },
      candidate: { ...idle, status: "running" },
    });
    expect(g.stillWaiting).toBe(true);
    expect(g.unavailable).toBe(false);
  });

  it("settles unknown+hasResult so both finished legs become unavailable", () => {
    const g = comparisonPendingState({
      baseline: { status: "unknown", hasResult: true, budgetTimedOut: false },
      candidate: { status: "failed", hasResult: false, budgetTimedOut: false },
    });
    expect(g.stillWaiting).toBe(false);
    expect(g.unavailable).toBe(true);
  });

  it("times out budget_stop wind-down per leg without cutting the other", () => {
    const mid = comparisonPendingState({
      baseline: {
        status: "budget_stop",
        hasResult: false,
        budgetTimedOut: true,
      },
      candidate: { status: "running", hasResult: false, budgetTimedOut: false },
    });
    expect(mid.baselineWindDown).toBe(true);
    expect(mid.stillWaiting).toBe(true);
    expect(mid.unavailable).toBe(false);

    const both = comparisonPendingState({
      baseline: {
        status: "budget_stop",
        hasResult: false,
        budgetTimedOut: true,
      },
      candidate: {
        status: "budget_stop",
        hasResult: false,
        budgetTimedOut: true,
      },
    });
    expect(both.stillWaiting).toBe(false);
    expect(both.unavailable).toBe(true);
  });

  it("treats budget_stop with result as settled wind-down complete", () => {
    const g = comparisonPendingState({
      baseline: {
        status: "budget_stop",
        hasResult: true,
        budgetTimedOut: false,
      },
      candidate: { status: "ok", hasResult: true, budgetTimedOut: false },
    });
    expect(g.baselineWindDown).toBe(false);
    expect(g.stillWaiting).toBe(false);
    expect(g.unavailable).toBe(true);
  });
});
