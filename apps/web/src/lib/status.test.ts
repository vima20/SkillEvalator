import { describe, expect, it } from "vitest";
import {
  benefitPendingState,
  comparisonPendingState,
  isBudgetStopWindDown,
  listWindDownRunIds,
  runIsActive,
  statusBadgeKind,
} from "./status.js";

describe("statusBadgeKind", () => {
  it("treats budget_stop wind-down as run, settled budget_stop as fail", () => {
    expect(statusBadgeKind("budget_stop", false)).toBe("run");
    expect(statusBadgeKind("budget_stop", true)).toBe("fail");
  });

  it("Comparison views pass hasResult into statusBadgeClass", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    const pending = fs.readFileSync(
      path.join(cwd, "src/components/ComparisonPending.tsx"),
      "utf8",
    );
    const list = fs.readFileSync(
      path.join(cwd, "src/app/comparison/page.tsx"),
      "utf8",
    );
    const detail = fs.readFileSync(
      path.join(cwd, "src/app/comparison/[evaluationId]/page.tsx"),
      "utf8",
    );
    expect(pending).toMatch(
      /statusBadgeClass\(baselineStatus,\s*baselineHasResult\)/,
    );
    expect(pending).toMatch(
      /statusBadgeClass\(candidateStatus,\s*candidateHasResult\)/,
    );
    expect(list).toMatch(/e\.baselineHasResult/);
    expect(list).toMatch(/e\.candidateHasResult/);
    // Pending rows use real tip badges — not a fake running/waiting chip.
    expect(list).not.toMatch(/statusBadgeClass\("running"\)/);
    expect(list).toMatch(/scorecard pending/);
    expect(detail).toMatch(
      /statusBadgeClass\(comparison\.baselineStatus,\s*true\)/,
    );
    expect(detail).toMatch(
      /statusBadgeClass\(comparison\.candidateStatus,\s*true\)/,
    );
  });
});

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

describe("listWindDownRunIds", () => {
  it("collects budget_stop without result only", () => {
    expect(isBudgetStopWindDown("budget_stop", false)).toBe(true);
    expect(isBudgetStopWindDown("budget_stop", true)).toBe(false);
    expect(
      listWindDownRunIds([
        { runId: "run_a", status: "budget_stop", result: null },
        { runId: "run_b", status: "budget_stop", result: { score: 1 } },
        { runId: "run_c", status: "running", result: null },
      ]),
    ).toEqual(["run_a"]);
  });
});

describe("benefitPendingState", () => {
  it("polls while status is missing or unknown", () => {
    expect(benefitPendingState({ status: null, budgetTimedOut: false })).toEqual(
      {
        windDown: false,
        stillWaiting: true,
        unavailable: false,
        orphanStuck: false,
      },
    );
    expect(
      benefitPendingState({ status: "unknown", budgetTimedOut: false }),
    ).toEqual({
      windDown: false,
      stillWaiting: true,
      unavailable: false,
      orphanStuck: false,
    });
  });

  it("polls during budget_stop wind-down until orphan timeout", () => {
    expect(
      benefitPendingState({ status: "budget_stop", budgetTimedOut: false }),
    ).toEqual({
      windDown: true,
      stillWaiting: true,
      unavailable: false,
      orphanStuck: false,
    });
    expect(
      benefitPendingState({ status: "budget_stop", budgetTimedOut: true }),
    ).toEqual({
      windDown: true,
      stillWaiting: false,
      unavailable: true,
      orphanStuck: true,
    });
  });

  it("marks terminal statuses without result as unavailable (not orphan)", () => {
    for (const status of ["ok", "failed", "cancelled"] as const) {
      expect(
        benefitPendingState({ status, budgetTimedOut: false }),
      ).toEqual({
        windDown: false,
        stillWaiting: false,
        unavailable: true,
        orphanStuck: false,
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
    expect(g.orphanStuck).toBe(false);
  });

  it("settles unknown+hasResult so both finished legs become unavailable", () => {
    const g = comparisonPendingState({
      baseline: { status: "unknown", hasResult: true, budgetTimedOut: false },
      candidate: { status: "failed", hasResult: false, budgetTimedOut: false },
    });
    expect(g.stillWaiting).toBe(false);
    expect(g.unavailable).toBe(true);
    expect(g.orphanStuck).toBe(false);
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
    expect(mid.orphanStuck).toBe(false);

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
    expect(both.orphanStuck).toBe(true);
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
    expect(g.orphanStuck).toBe(false);
  });
});
