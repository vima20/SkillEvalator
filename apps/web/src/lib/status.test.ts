import { describe, expect, it } from "vitest";
import {
  benefitPendingState,
  comparisonPendingState,
  isBudgetStopWindDown,
  isOrphanActiveWindDown,
  listWindDownRunIds,
  orphanStuckFromFinalizePayload,
  orphanWindDownIsStuck,
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
    expect(list).toMatch(/scorecard unavailable/);
    expect(list).toMatch(/tipActive/);
    expect(list).toMatch(/scorecardUnavailable/);
    expect(list).toMatch(/evaluationTipPairIsActive/);
    // Pending list chip: tip legs beat stale evaluation.json mode.
    expect(list).toMatch(/comparisonUiFromPacked/);
    expect(list).toMatch(/comparisonVerdictListLabel/);
    expect(list).toMatch(/adoptionConfirmation/);
    expect(list).toMatch(/downloadsOk = downloadGate\?\.ok === true/);
    expect(list).toMatch(/comparisonUiFromPacked/);
    expect(list).toMatch(/e\.comparisonMeta\?\.title/);
    // tipActive + result.json → Benefit (waiting); without result → run detail.
    expect(list).toMatch(
      /e\.tipActive \?[\s\S]*?e\.candidateHasResult \?[\s\S]*?\/benefit\/\$\{e\.candidateRunId\}[\s\S]*?Benefit · waiting/,
    );
    expect(list).toMatch(
      /e\.tipActive \?[\s\S]*?\/runs\/\$\{e\.candidateRunId\}[\s\S]*?Candidate run/,
    );
    // Unavailable + result.json → Benefit; no result → run detail (not BenefitPending dead-end).
    expect(list).toMatch(
      /e\.scorecardUnavailable \?[\s\S]*?e\.candidateHasResult \?[\s\S]*?\/benefit\/\$\{e\.candidateRunId\}[\s\S]*?Benefit · unavailable/,
    );
    expect(list).toMatch(
      /e\.scorecardUnavailable \?[\s\S]*?\/runs\/\$\{e\.candidateRunId\}[\s\S]*?Candidate run/,
    );
    // Ready handoff label must say Benefit (not Candidate).
    expect(list).toMatch(
      /e\.downloadsOk \?[\s\S]*?\/benefit\/\$\{e\.candidateRunId\}[\s\S]*?>\s*Benefit\s*</,
    );
    expect(list).not.toMatch(
      /\/benefit\/\$\{e\.candidateRunId\}[\s\S]*?>\s*Candidate\s*</,
    );
    expect(detail).toMatch(
      /statusBadgeClass\(comparison\.baselineStatus,\s*true\)/,
    );
    expect(detail).toMatch(
      /statusBadgeClass\(comparison\.candidateStatus,\s*true\)/,
    );
    // Detail H1 follows client pending gate (orphan-timeout), not SSR tipActive.
    expect(detail).toMatch(/H1 lives in ComparisonPending/);
    const pendingUi = fs.readFileSync(
      path.join(cwd, "src/components/ComparisonPending.tsx"),
      "utf8",
    );
    expect(pendingUi).toMatch(/pageHeading/);
    expect(pendingUi).toMatch(/Settle the stuck leg/);
    expect(pendingUi).toMatch(/cancel_requested/);
    expect(pendingUi).toMatch(/Waiting for results/);
    expect(pendingUi).toMatch(
      /candidateRunId && candidateHasResult/,
    );
    expect(pendingUi).toMatch(
      /Open Benefit — Comparison unavailable/,
    );
    expect(pendingUi).toMatch(
      /Open Benefit — waiting for Comparison/,
    );
    expect(pendingUi).toMatch(/Open candidate run/);
    expect(pendingUi).toMatch(/Refresh now/);
    // Official unavailable re-run keeps ?mode=official (Benefit / Settings parity).
    expect(pendingUi).toMatch(/withNewRunHandoff\(pilotFocus, preferOfficial\)/);
    expect(pendingUi).toMatch(/pairedEvalPreferOfficial/);
    expect(detail).toMatch(/Confirm adoption — new official pair/);
    expect(detail).toMatch(/provisionalPass/);
    expect(detail).toMatch(/comparisonUiFromPacked/);
    expect(detail).toMatch(/comparisonVerdictBannerClass/);
    expect(detail).toMatch(/verdictHeadline/);
    expect(detail).toMatch(/mode=\{meta\.mode\}/);
    expect(detail).toMatch(/baselineMode=\{baseline\?\.mode\}/);
    expect(detail).toMatch(/candidateMode=\{candidate\?\.mode\}/);
    // orphanStuck keeps poll + Refresh now (catch external heal without hard reload).
    expect(pendingUi).toMatch(/!stillWaiting && !orphanStuck/);
    expect(pendingUi).toMatch(/Resend cancel or Refresh \(heal\)/);
    expect(pendingUi).toMatch(/while the other tip may still be running/);
    expect(pendingUi).toMatch(/orphanStuck \? \(/);
    // Waiting Refresh finalizes wind-down legs (list / run detail parity).
    expect(pendingUi).toMatch(/baselineWindDown && baselineRunId/);
    // !ok / network → re-arm (false), not fake stuck.
    expect(pendingUi).toMatch(/if \(!res\.ok\) return false/);
    expect(pendingUi).toMatch(/catch \{\s*return false/);
    const benefitPendingUi = fs.readFileSync(
      path.join(cwd, "src/components/BenefitPending.tsx"),
      "utf8",
    );
    expect(benefitPendingUi).toMatch(/!stillWaiting && !orphanStuck/);
    expect(benefitPendingUi).toMatch(/stillWaiting \|\| orphanStuck/);
    expect(benefitPendingUi).toMatch(/Open run — Cancel \/ Resend cancel/);
    expect(benefitPendingUi).toMatch(/orphanStuckFromFinalizePayload/);
    expect(benefitPendingUi).toMatch(/if \(windDown\)/);
    expect(benefitPendingUi).toMatch(
      /do not fake orphan stuck|Transport\/HTTP failure/,
    );
    // Benefit detail with result + pairPending waiting must poll (stale INCONCLUSIVE).
    const benefitDetail = fs.readFileSync(
      path.join(cwd, "src/app/benefit/[runId]/page.tsx"),
      "utf8",
    );
    const benefitWait = fs.readFileSync(
      path.join(cwd, "src/components/BenefitPairWaitingRefresh.tsx"),
      "utf8",
    );
    expect(benefitDetail).toMatch(/pairPending/);
    expect(benefitDetail).toMatch(/BenefitPairWaitingRefresh/);
    expect(benefitDetail).toMatch(
      /pairWaiting \? \(\s*<BenefitPairWaitingRefresh/,
    );
    expect(benefitDetail).toMatch(/pairUnavailable/);
    expect(benefitDetail).toMatch(
      /!supersededTip && pairPending === "unavailable"/,
    );
    expect(benefitDetail).toMatch(
      /!supersededTip && pairPending === "waiting"/,
    );
    expect(benefitDetail).toMatch(/Comparison unavailable/);
    expect(benefitDetail).toMatch(/Waiting for Comparison/);
    // Official Benefit unavailable → New run with ?mode=official.
    expect(benefitDetail).toMatch(/withNewRunHandoff\(pilotFocus, preferOfficial\)/);
    expect(benefitDetail).toMatch(/pairedEvalPreferOfficial/);
    expect(benefitDetail).toMatch(/provisionalPass/);
    expect(benefitDetail).toMatch(/comparisonUiFromPacked/);
    expect(benefitDetail).toMatch(/comparisonProvisional/);
    expect(benefitDetail).toMatch(/comparisonVerdictBannerClass/);
    expect(benefitDetail).toMatch(/Confirm adoption — new official pair/);
    expect(benefitWait).toMatch(/setInterval/);
    expect(benefitWait).toMatch(/router\.refresh/);
    expect(benefitWait).toMatch(/WIND_DOWN_ORPHAN_MS/);
    expect(benefitWait).toMatch(/runDetailFinalizeOrphansPath/);
    expect(benefitWait).toMatch(/windDownRunIds/);
    expect(benefitWait).toMatch(/cost-cap or cancel/);
    expect(benefitWait).toMatch(/Resend cancel/);
    // Refresh now finalizes wind-down siblings (not only after orphanStuck).
    expect(benefitWait).toMatch(/if \(stuckIds\.length > 0\)/);
    expect(benefitWait).toMatch(/runDetailFinalizeOrphansPath\(runId\)/);
    // Multi-sibling: aggregate stillStuck (not per-id setOrphanStuck races).
    expect(benefitWait).toMatch(/let stillStuck = false/);
    expect(benefitWait).toMatch(/if \(stuck\) stillStuck = true/);
    expect(benefitWait).toMatch(/setOrphanStuck\(stillStuck\)/);
    expect(benefitDetail).toMatch(/pairWindDownRunIds/);
    expect(benefitDetail).toMatch(/listWindDownRunIds/);
    // Benefit list / Dashboard / Run detail share Comparison waiting labels.
    const benefitList = fs.readFileSync(
      path.join(cwd, "src/app/benefit/page.tsx"),
      "utf8",
    );
    const dashboard = fs.readFileSync(
      path.join(cwd, "src/app/dashboard/page.tsx"),
      "utf8",
    );
    const runDetail = fs.readFileSync(
      path.join(cwd, "src/app/runs/[runId]/RunDetailClient.tsx"),
      "utf8",
    );
    const runDetailPage = fs.readFileSync(
      path.join(cwd, "src/app/runs/[runId]/page.tsx"),
      "utf8",
    );
    const runDetailApi = fs.readFileSync(
      path.join(cwd, "src/app/api/runs/[runId]/route.ts"),
      "utf8",
    );
    expect(benefitList).toMatch(/benefitPairCtaLabel/);
    expect(benefitList).toMatch(/pairPending/);
    expect(benefitList).toMatch(/comparisonUiFromPacked/);
    expect(benefitList).toMatch(/comparisonMeta\?\.title/);
    expect(benefitList).toMatch(/verdictChipTone/);
    expect(benefitList).toMatch(/benefitVerdictChipToneFromComparison/);
    expect(list).toMatch(/comparisonVerdictChipTone/);
    expect(benefitList).toMatch(/benefitListVerdictChipLabel/);
    expect(list).toMatch(/provisional/);
    expect(dashboard).toMatch(/benefitPairCtaLabel/);
    expect(dashboard).toMatch(/evaluationPairPending/);
    expect(dashboard).toMatch(/createEvaluationPairBrowseCache/);
    expect(dashboard).toMatch(/comparisonMeta/);
    const runsList = fs.readFileSync(
      path.join(cwd, "src/app/runs/page.tsx"),
      "utf8",
    );
    expect(runsList).toMatch(/createEvaluationPairBrowseCache/);
    expect(runDetail).toMatch(/benefitPairCtaLabel/);
    expect(runDetail).toMatch(/data\.pairPending/);
    expect(runDetail).toMatch(/runDetailShouldPoll/);
    // Sibling wind-down finalize while pairPending waiting (Benefit parity).
    expect(runDetail).toMatch(/pairWindDownRunIds/);
    expect(runDetail).toMatch(/cost-cap or cancel/);
    expect(runDetail).toMatch(/Resend cancel/);
    expect(runDetail).toMatch(/orphanStuckFromFinalizePayload/);
    expect(runDetail).toMatch(/setPairOrphanStuck\(stillStuck\)/);
    // Manual Refresh heals orphan wind-down (not healRunForRead-only GET).
    expect(runDetail).toMatch(/async function onManualRefresh/);
    expect(runDetail).toMatch(
      /refresh\(\{\s*finalizeOrphans:\s*healSelf\s*\}\)/,
    );
    expect(runDetail).toMatch(/isOrphanActiveWindDown/);
    // Live vs gone cost-cap copy uses hasLiveJob, not the poll flag.
    expect(runDetail).toMatch(
      /budgetStopWindDown && data\.hasLiveJob === true/,
    );
    expect(runDetail).toMatch(/Worker may be gone/);
    expect(runDetail).toMatch(/Cost hard-stop hit/);
    // Successful Cancel clears cancelling so Resend cancel can re-enable.
    expect(runDetail).toMatch(
      /await refresh\(\);[\s\S]*?setCancelling\(false\)/,
    );
    expect(runDetail).toMatch(/Resend cancel/);
    // Auto-finalize re-arms on failed GET (list parity), not only live job.
    expect(runDetail).toMatch(
      /!next \|\|\s*\([\s\S]*?hasLiveJob === true\)/,
    );
    expect(runDetailPage).toMatch(/loadPairWaitingWindDownRunIds/);
    expect(runDetailApi).toMatch(/loadPairWaitingWindDownRunIds/);
    // Benefit CTA stays visible while pairPending waiting still polls.
    expect(runDetail).toMatch(/\{result \? \(/);
    expect(runDetail).not.toMatch(/\{result && !polling \?/);
    // List finalize re-arms when live job remains (same as detail/pending).
    const listRefresh = fs.readFileSync(
      path.join(cwd, "src/components/RunsAutoRefresh.tsx"),
      "utf8",
    );
    expect(listRefresh).toMatch(/finalizeGen/);
    expect(listRefresh).toMatch(/isOrphanActiveWindDown/);
    expect(listRefresh).toMatch(/hasLiveJob/);
    // Network / !ok finalize must re-arm — do not drop settle for the session.
    expect(listRefresh).toMatch(/if \(!res\.ok\)/);
    expect(listRefresh).toMatch(/catch \{\s*\/\/ Network/);
    // Manual Refresh finalizes wind-down ids (same helper as the 90s timer).
    expect(listRefresh).toMatch(/finalizeListWindDownIds/);
    expect(listRefresh).toMatch(/if \(windDownKey\)/);
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
  it("collects budget_stop and cancel_requested without result", () => {
    expect(isBudgetStopWindDown("budget_stop", false)).toBe(true);
    expect(isBudgetStopWindDown("budget_stop", true)).toBe(false);
    expect(isOrphanActiveWindDown("budget_stop", false)).toBe(true);
    expect(isOrphanActiveWindDown("cancel_requested", false)).toBe(true);
    expect(isOrphanActiveWindDown("cancel_requested", true)).toBe(false);
    expect(isOrphanActiveWindDown("running", false)).toBe(false);
    expect(
      listWindDownRunIds([
        { runId: "run_a", status: "budget_stop", result: null },
        { runId: "run_b", status: "budget_stop", result: { score: 1 } },
        { runId: "run_c", status: "cancel_requested", result: null },
        { runId: "run_d", status: "running", result: null },
      ]),
    ).toEqual(["run_a", "run_c"]);
  });

  it("marks stuck only when wind-down remains without a live job", () => {
    expect(
      orphanWindDownIsStuck({
        status: "cancel_requested",
        hasResult: false,
        hasLiveJob: true,
      }),
    ).toBe(false);
    expect(
      orphanWindDownIsStuck({
        status: "cancel_requested",
        hasResult: false,
        hasLiveJob: false,
      }),
    ).toBe(true);
    expect(
      orphanStuckFromFinalizePayload({
        status: { status: "budget_stop" },
        result: null,
        hasLiveJob: true,
      }),
    ).toBe(false);
    expect(
      orphanStuckFromFinalizePayload({
        status: { status: "failed" },
        result: null,
        hasLiveJob: false,
      }),
    ).toBe(false);
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

  it("polls during cancel_requested until orphan timeout", () => {
    expect(
      benefitPendingState({
        status: "cancel_requested",
        budgetTimedOut: false,
      }),
    ).toEqual({
      windDown: true,
      stillWaiting: true,
      unavailable: false,
      orphanStuck: false,
    });
    expect(
      benefitPendingState({
        status: "cancel_requested",
        budgetTimedOut: true,
      }),
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
    // Stuck CTA + Refresh (heal) while the other tip is still running.
    expect(mid.orphanStuck).toBe(true);

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

  it("times out cancel_requested orphan legs like budget_stop", () => {
    const g = comparisonPendingState({
      baseline: {
        status: "cancel_requested",
        hasResult: false,
        budgetTimedOut: true,
      },
      candidate: {
        status: "cancel_requested",
        hasResult: false,
        budgetTimedOut: true,
      },
    });
    expect(g.baselineWindDown).toBe(true);
    expect(g.candidateWindDown).toBe(true);
    expect(g.stillWaiting).toBe(false);
    expect(g.unavailable).toBe(true);
    expect(g.orphanStuck).toBe(true);
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
