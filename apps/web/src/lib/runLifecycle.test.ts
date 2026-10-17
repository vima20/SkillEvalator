import { describe, expect, it } from "vitest";
import {
  cancelGate,
  isRetryBudgetStopping,
  pairedCancelAlsoCopy,
  pairedCancelPeerStatuses,
  parseAlsoCancelledRunId,
  isRetryBillingBlocked,
  RETRY_ENQUEUE_LOCK_BUSY_ERROR,
  RETRY_INSUFFICIENT_QUOTA_BLOCKED,
  RETRY_NON_RETRYABLE_ERROR_CODES,
  RETRY_PREFLIGHT_BLOCKED,
  RETRY_STILL_FINISHING_ERROR,
  resolveRetryPostError,
  retryGate,
  retryNonRetryableBlockedReason,
  retryOfficialPilotBlockedReason,
  retrySnapshotGate,
  runDetailCanCancel,
} from "./runLifecycle.js";

const formatCost = (n: number) => `cost-cap:${n}`;

describe("cancelGate", () => {
  it("allows queued/running and already-cancelled", () => {
    expect(cancelGate("queued", false).allow).toBe(true);
    expect(cancelGate("running", false).allow).toBe(true);
    expect(cancelGate("cancelled", false)).toEqual({
      allow: true,
      alreadyCancelled: true,
    });
  });

  it("allows budget_stop wind-down without result.json", () => {
    expect(cancelGate("budget_stop", false)).toEqual({ allow: true });
  });

  it("rejects settled budget_stop and other terminals", () => {
    expect(cancelGate("budget_stop", true).allow).toBe(false);
    expect(cancelGate("ok", true).allow).toBe(false);
    expect(cancelGate("failed", false).allow).toBe(false);
  });
});

describe("isRetryBudgetStopping", () => {
  it("is true only for budget_stop without result.json", () => {
    expect(isRetryBudgetStopping("budget_stop", false)).toBe(true);
    expect(isRetryBudgetStopping("budget_stop", true)).toBe(false);
    expect(isRetryBudgetStopping("failed", false)).toBe(false);
    expect(RETRY_STILL_FINISHING_ERROR).toMatch(/still finishing/);
  });
});

describe("RETRY_INSUFFICIENT_QUOTA_BLOCKED", () => {
  it("mentions credits and not auto-retried", () => {
    expect(RETRY_INSUFFICIENT_QUOTA_BLOCKED).toMatch(/credits/i);
    expect(RETRY_INSUFFICIENT_QUOTA_BLOCKED).toMatch(/not auto-retried/i);
  });
});

describe("RETRY_ENQUEUE_LOCK_BUSY_ERROR", () => {
  it("matches core retryDedup copy", async () => {
    const core = await import("@skillevalator/core");
    expect(RETRY_ENQUEUE_LOCK_BUSY_ERROR).toBe(
      core.RETRY_ENQUEUE_LOCK_BUSY_ERROR,
    );
  });
});

describe("retryNonRetryableBlockedReason", () => {
  it("matches core NON_RETRYABLE_ERROR_CODES", async () => {
    const { NON_RETRYABLE_ERROR_CODES } = await import(
      "@skillevalator/core"
    );
    expect([...RETRY_NON_RETRYABLE_ERROR_CODES].sort()).toEqual(
      [...NON_RETRYABLE_ERROR_CODES].sort(),
    );
  });

  it("returns shared copy for billing codes; null otherwise", () => {
    expect(retryNonRetryableBlockedReason("billing_not_active")).toBe(
      RETRY_INSUFFICIENT_QUOTA_BLOCKED,
    );
    expect(isRetryBillingBlocked("account_deactivated")).toBe(true);
    expect(retryNonRetryableBlockedReason("orphan_queued")).toBeNull();
    expect(isRetryBillingBlocked("orphan_queued")).toBe(false);
  });
});

describe("RETRY_PREFLIGHT_BLOCKED", () => {
  it("points to Settings and preflight", () => {
    expect(RETRY_PREFLIGHT_BLOCKED).toMatch(/preflight/i);
    expect(RETRY_PREFLIGHT_BLOCKED).toMatch(/Settings/i);
  });
});

describe("retryOfficialPilotBlockedReason", () => {
  it("uses Official retry blocked prefix (not official mode blocked)", () => {
    const msg = retryOfficialPilotBlockedReason(["stale queue"]);
    expect(msg).toBe(
      "Official retry blocked — Settings not Ready: stale queue.",
    );
    expect(msg).not.toMatch(/official mode blocked/i);
  });
});

describe("resolveRetryPostError", () => {
  it("fail-closes billing non-retryable codes without body.error", () => {
    expect(
      resolveRetryPostError({ errorCode: "insufficient_quota" }, formatCost),
    ).toBe(RETRY_INSUFFICIENT_QUOTA_BLOCKED);
    expect(
      resolveRetryPostError(
        { errorCode: "billing_hard_limit_reached" },
        formatCost,
      ),
    ).toBe(RETRY_INSUFFICIENT_QUOTA_BLOCKED);
  });

  it("fail-closes retry_enqueue_lock_busy and retry_still_finishing", () => {
    expect(
      resolveRetryPostError(
        { errorCode: "retry_enqueue_lock_busy" },
        formatCost,
      ),
    ).toBe(RETRY_ENQUEUE_LOCK_BUSY_ERROR);
    expect(
      resolveRetryPostError(
        { errorCode: "retry_still_finishing" },
        formatCost,
      ),
    ).toBe(RETRY_STILL_FINISHING_ERROR);
  });

  it("maps preflight, official pilot, and cost-cap codes", () => {
    expect(
      resolveRetryPostError(
        { errorCode: "retry_preflight_blocked" },
        formatCost,
      ),
    ).toBe(RETRY_PREFLIGHT_BLOCKED);
    expect(
      resolveRetryPostError(
        {
          errorCode: "official_pilot_not_ready",
          blockers: ["stale queue"],
        },
        formatCost,
      ),
    ).toBe(retryOfficialPilotBlockedReason(["stale queue"]));
    expect(
      resolveRetryPostError(
        { errorCode: "enqueue_cost_over_cap", costCapUsd: 0.5 },
        formatCost,
      ),
    ).toBe("cost-cap:0.5");
  });

  it("falls back to body.error or Retry failed", () => {
    expect(
      resolveRetryPostError({ error: "custom" }, formatCost),
    ).toBe("custom");
    expect(resolveRetryPostError({}, formatCost)).toBe("Retry failed");
  });

  it("is used by RunDetailClient onRetry", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/app/runs/[runId]/RunDetailClient.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/resolveRetryPostError/);
    expect(src).toMatch(/formatRetryCostBlockedReason/);
  });
});

describe("runDetailCanCancel", () => {
  it("allows orphan budget_stop wind-down even when not polling", () => {
    expect(
      runDetailCanCancel({ status: "budget_stop", hasResult: false }),
    ).toBe(true);
  });

  it("blocks settled budget_stop and cancel_requested UI", () => {
    expect(
      runDetailCanCancel({ status: "budget_stop", hasResult: true }),
    ).toBe(false);
    expect(
      runDetailCanCancel({
        status: "budget_stop",
        hasResult: false,
        cancelRequested: true,
      }),
    ).toBe(false);
  });
});

describe("parseAlsoCancelledRunId / pairedCancelAlsoCopy", () => {
  it("accepts non-empty sibling ids from cancel JSON", () => {
    expect(parseAlsoCancelledRunId("run_sib")).toBe("run_sib");
    expect(parseAlsoCancelledRunId("  run_sib  ")).toBe("run_sib");
    expect(parseAlsoCancelledRunId("")).toBeNull();
    expect(parseAlsoCancelledRunId(undefined)).toBeNull();
  });

  it("formats stable alsoCancelled hint copy", () => {
    expect(pairedCancelAlsoCopy("run_sib")).toMatch(/run_sib/);
    expect(pairedCancelAlsoCopy("run_sib")).toMatch(/paired sibling/i);
  });
});

describe("runDetailFinalizeOrphansPath", () => {
  it("builds client-safe finalize query path", async () => {
    const { runDetailFinalizeOrphansPath } = await import("./runLifecycle.js");
    expect(runDetailFinalizeOrphansPath("run_a/b")).toBe(
      "/api/runs/run_a%2Fb?finalizeOrphans=1",
    );
  });
});

describe("retryGate", () => {
  it("blocks while a live job file is finishing", () => {
    const g = retryGate({
      status: "budget_stop",
      hasLiveJob: true,
    });
    expect(g.allow).toBe(false);
    if (!g.allow) expect(g.error).toBe(RETRY_STILL_FINISHING_ERROR);
  });

  it("allows settled budget_stop / failed / cancelled", () => {
    expect(
      retryGate({ status: "budget_stop", hasLiveJob: false }).allow,
    ).toBe(true);
    expect(retryGate({ status: "failed", hasLiveJob: false }).allow).toBe(
      true,
    );
    expect(retryGate({ status: "cancelled", hasLiveJob: false }).allow).toBe(
      true,
    );
  });

  it("rejects running and non-retryable errors", () => {
    expect(retryGate({ status: "running", hasLiveJob: false }).allow).toBe(
      false,
    );
    expect(
      retryGate({
        status: "failed",
        hasLiveJob: false,
        nonRetryableError: true,
      }).allow,
    ).toBe(false);
  });
});

describe("pairedCancelPeerStatuses", () => {
  it("includes budget_stop for cascade lookup", () => {
    expect(pairedCancelPeerStatuses().has("budget_stop")).toBe(true);
    expect(pairedCancelPeerStatuses().has("running")).toBe(true);
  });
});

describe("retrySnapshotGate", () => {
  it("requires non-empty SKILL.md + version for candidate", () => {
    expect(
      retrySnapshotGate({
        role: "candidate",
        hasSkillMd: true,
        hasPinnedVersion: true,
      }).allow,
    ).toBe(true);
    expect(
      retrySnapshotGate({
        role: "candidate",
        hasSkillMd: false,
        hasPinnedVersion: true,
      }).allow,
    ).toBe(false);
    expect(
      retrySnapshotGate({
        role: "candidate",
        hasSkillMd: true,
        hasPinnedVersion: false,
      }).allow,
    ).toBe(false);
    const emptyMd = retrySnapshotGate({
      role: "candidate",
      hasSkillMd: false, // route treats whitespace-only as false
      hasPinnedVersion: true,
    });
    expect(emptyMd.allow).toBe(false);
    if (!emptyMd.allow) expect(emptyMd.error).toMatch(/empty|missing/i);
  });

  it("requires pinned version for baseline (SKILL.md optional)", () => {
    expect(
      retrySnapshotGate({
        role: "baseline",
        hasSkillMd: false,
        hasPinnedVersion: true,
      }),
    ).toEqual({ allow: true, useSkillSnapshot: true });
    const missing = retrySnapshotGate({
      role: "baseline",
      hasSkillMd: true,
      hasPinnedVersion: false,
    });
    expect(missing.allow).toBe(false);
    if (!missing.allow) expect(missing.error).toMatch(/baseline/);
  });
});
