import { describe, expect, it } from "vitest";
import {
  RETRY_INSUFFICIENT_QUOTA_BLOCKED,
  RETRY_PREFLIGHT_BLOCKED,
  retryOfficialPilotBlockedReason,
} from "./runLifecycle.js";
import {
  computeRunDetailRetryAdmission,
  retryPairMetaAdmission,
} from "./runDetailRetryAdmission.js";

const okCost = { blocked: false, reason: null };
const okSnap = { hasSkillMd: true, hasPinnedVersion: true };

function base(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run_tip",
    status: "failed" as const,
    hasLiveJob: false,
    mode: "dry-run" as const,
    evaluationId: null as string | null,
    preflightOk: true,
    pilotBlockers: [] as string[],
    costAdmission: okCost,
    snapshotFlags: okSnap,
    webAuthKind: "open" as const,
    requireWebAuthConfigured: false,
    ...overrides,
  };
}

describe("computeRunDetailRetryAdmission", () => {
  it("allows settled dry-run when preflight green and under cap", () => {
    expect(computeRunDetailRetryAdmission(base())).toEqual({
      canRetry: true,
      blockedReason: null,
    });
  });

  it("blocks live job wind-down", () => {
    const out = computeRunDetailRetryAdmission(
      base({ status: "budget_stop", hasLiveJob: true }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/still finishing/i);
  });

  it("blocks budgetStopping even without live job file", () => {
    const out = computeRunDetailRetryAdmission(
      base({ status: "budget_stop", budgetStopping: true }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/still finishing/i);
  });

  it("blocks insufficient_quota and other billing non-retryable codes", () => {
    for (const errorCode of [
      "insufficient_quota",
      "billing_not_active",
      "billing_hard_limit_reached",
      "account_deactivated",
    ]) {
      const out = computeRunDetailRetryAdmission(base({ errorCode }));
      expect(out.canRetry).toBe(false);
      expect(out.blockedReason).toBe(RETRY_INSUFFICIENT_QUOTA_BLOCKED);
    }
  });

  it("blocks when retry-enqueue lock is busy", () => {
    const out = computeRunDetailRetryAdmission(
      base({ enqueueLockBusy: true }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/already in progress/i);
  });

  it("blocks when preflight not ok", () => {
    const out = computeRunDetailRetryAdmission(base({ preflightOk: false }));
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toBe(RETRY_PREFLIGHT_BLOCKED);
  });

  it("blocks official when Settings not Ready", () => {
    const blockers = [
      "FAKE_PRODUCE=known-good — unset for official live pilot",
    ];
    const out = computeRunDetailRetryAdmission(
      base({
        mode: "official",
        evaluationId: "eval_1",
        pilotBlockers: blockers,
        webAuthKind: "required",
        env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
        healedMeta: {
          baselineRunId: "run_tip",
          candidateRunId: "run_other",
        },
        explicitRole: "baseline",
      }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toBe(
      retryOfficialPilotBlockedReason(blockers),
    );
  });

  it("blocks official without evaluationId", () => {
    const out = computeRunDetailRetryAdmission(
      base({
        mode: "official",
        evaluationId: null,
        webAuthKind: "required",
        env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
      }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/evaluation/i);
  });

  it("blocks when cost admission denied", () => {
    const out = computeRunDetailRetryAdmission(
      base({
        status: "budget_stop",
        costAdmission: {
          blocked: true,
          reason: "Per-leg estimate exceeds the $0.01 USD hard-stop",
          errorCode: "enqueue_cost_over_cap",
          costCapUsd: 0.01,
        },
      }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/hard-stop/i);
  });

  it("returns null reason for non-retryable status", () => {
    expect(
      computeRunDetailRetryAdmission(base({ status: "running", hasLiveJob: true })),
    ).toEqual({ canRetry: false, blockedReason: null });
  });

  it("blocks official when healed meta missing", () => {
    const out = computeRunDetailRetryAdmission(
      base({
        mode: "official",
        evaluationId: "eval_1",
        healedMeta: null,
        webAuthKind: "required",
        env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
      }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/evaluation\.json/i);
  });

  it("blocks when runId is not a tip meta leg", () => {
    const out = computeRunDetailRetryAdmission(
      base({
        runId: "run_old",
        mode: "official",
        evaluationId: "eval_1",
        healedMeta: {
          baselineRunId: "run_b",
          candidateRunId: "run_c",
        },
        webAuthKind: "required",
        env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
      }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/meta leg/i);
  });

  it("blocks candidate retry without skill snapshot", () => {
    const out = computeRunDetailRetryAdmission(
      base({
        runId: "run_c",
        mode: "official",
        evaluationId: "eval_1",
        healedMeta: {
          baselineRunId: "run_b",
          candidateRunId: "run_c",
        },
        snapshotFlags: { hasSkillMd: false, hasPinnedVersion: true },
        webAuthKind: "required",
        env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
      }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/skill-snapshot/i);
  });

  it("blocks baseline retry without pinned version", () => {
    const out = computeRunDetailRetryAdmission(
      base({
        runId: "run_b",
        mode: "official",
        evaluationId: "eval_1",
        healedMeta: {
          baselineRunId: "run_b",
          candidateRunId: "run_c",
        },
        snapshotFlags: { hasSkillMd: false, hasPinnedVersion: false },
        webAuthKind: "required",
        env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
      }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/pinned evalSkillVersion/i);
  });

  it("allows official tip candidate with snapshot pin", () => {
    const out = computeRunDetailRetryAdmission(
      base({
        runId: "run_c",
        mode: "official",
        evaluationId: "eval_1",
        healedMeta: {
          baselineRunId: "run_b",
          candidateRunId: "run_c",
        },
        webAuthKind: "required",
        env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
      }),
    );
    expect(out).toEqual({ canRetry: true, blockedReason: null });
  });

  it("blocks official when stale queue remains after inspect", () => {
    const out = computeRunDetailRetryAdmission(
      base({
        runId: "run_c",
        mode: "official",
        evaluationId: "eval_1",
        healedMeta: {
          baselineRunId: "run_b",
          candidateRunId: "run_c",
        },
        pilotBlockers: [
          "Stale queue: orphan .running.json for run_other — Refresh Settings",
        ],
        webAuthKind: "required",
        env: { OPENAI_API_KEY: "sk", FAKE_PRODUCE: "" },
      }),
    );
    expect(out.canRetry).toBe(false);
    expect(out.blockedReason).toMatch(/Stale queue/i);
  });
});

describe("retryPairMetaAdmission", () => {
  it("allows dry-run when meta missing", () => {
    expect(
      retryPairMetaAdmission({
        runId: "run_x",
        mode: "dry-run",
        evaluationId: "eval_1",
        healed: null,
      }).ok,
    ).toBe(true);
  });

  it("blocks role/slot mismatch", () => {
    const out = retryPairMetaAdmission({
      runId: "run_b",
      mode: "official",
      evaluationId: "eval_1",
      explicitRole: "candidate",
      healed: { baselineRunId: "run_b", candidateRunId: "run_c" },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/does not match/i);
    expect(out.errorCode).toBe("official_evaluation_role_slot_mismatch");
  });

  it("returns official_evaluation_meta_missing when healed absent", () => {
    const out = retryPairMetaAdmission({
      runId: "run_x",
      mode: "official",
      evaluationId: "eval_1",
      healed: null,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errorCode).toBe("official_evaluation_meta_missing");
  });
});

describe("POST /retry shares admission gate helpers", () => {
  it("imports retryPairMetaAdmission and readRetrySnapshotFlags", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/runs/[runId]/retry/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/retryPairMetaAdmission/);
    expect(src).toMatch(/readRetrySnapshotFlags/);
    expect(src).toMatch(/loadTerminalJobForRetry/);
    expect(src).toMatch(/RETRY_ENQUEUE_LOCK_BUSY_ERROR/);
    expect(src).toMatch(/retry_enqueue_lock_busy/);
    expect(src).toMatch(/retryNonRetryableBlockedReason/);
    expect(src).toMatch(/RETRY_PREFLIGHT_BLOCKED/);
    expect(src).toMatch(/retry_preflight_blocked/);
    expect(src).toMatch(/retry_still_finishing/);
    expect(src).toMatch(/RETRY_EVALUATION_META_REVERT_FAILED/);
    expect(src).toMatch(/evaluation_meta_revert_failed/);
    expect(src).toMatch(/retry_comparison_link_failed/);
    expect(src).toMatch(/snapGate\.errorCode/);
    expect(src).toMatch(/retryOfficialPilotBlockedReason/);
    expect(src).toMatch(/healRunForRead/);
    expect(src).not.toMatch(/healRunOrphansFs/);
    expect(src).not.toMatch(/function loadFailedJob/);
  });
});
