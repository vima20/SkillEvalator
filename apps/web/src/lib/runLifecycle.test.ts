import { describe, expect, it } from "vitest";
import {
  NON_RETRYABLE_ERROR_CODES,
  officialEnqueueAllowed,
  RETRY_ENQUEUE_LOCK_BUSY_ERROR as CORE_RETRY_ENQUEUE_LOCK_BUSY_ERROR,
} from "@skillevalator/core";
import {
  cancelGate,
  CANCEL_FAILED_ERROR,
  CANCEL_NOT_FOUND_ERROR,
  isRetryBudgetStopping,
  pairedCancelAlsoCopy,
  pairedCancelPeerStatuses,
  parseAlsoCancelledRunId,
  isRetryBillingBlocked,
  resolveCancelPostError,
  RETRY_FAILED_ERROR,
  ENQUEUE_EVALUATION_META_FAILED,
  ENQUEUE_FAILED_ERROR,
  ENQUEUE_INVALID_REQUEST_ERROR,
  ENQUEUE_PAIR_CANDIDATE_FAILED,
  ENQUEUE_PREFLIGHT_BLOCKED,
  OFFICIAL_ADMISSION_API_KEY_MISSING,
  OFFICIAL_ADMISSION_EVALUATION_REQUIRED,
  OFFICIAL_ADMISSION_HOST_GRADE_FORBIDDEN,
  OFFICIAL_ADMISSION_PAIR_REQUIRED,
  OFFICIAL_ADMISSION_REPEATS_TOO_LOW,
  OFFICIAL_ADMISSION_SMOKE_FORBIDDEN,
  OFFICIAL_ADMISSION_WEB_AUTH_REQUIRED,
  RETRY_COMPARISON_LINK_FAILED,
  RETRY_CONFIG_MISSING_ERROR,
  RETRY_ENQUEUE_JOB_LOCK_BUSY,
  RETRY_ENQUEUE_LOCK_BUSY_ERROR,
  RETRY_ENQUEUE_QUEUE_FULL,
  RETRY_ENQUEUE_SKILL_NOT_READY,
  RETRY_EVALUATION_META_REVERT_FAILED,
  RETRY_INSUFFICIENT_QUOTA_BLOCKED,
  RETRY_INVALID_STATUS_ERROR,
  RETRY_NON_RETRYABLE_ERROR,
  RETRY_NON_RETRYABLE_ERROR_CODES,
  RETRY_NOT_FOUND_ERROR,
  RETRY_OFFICIAL_EVALUATION_LEG_MISMATCH,
  RETRY_OFFICIAL_EVALUATION_META_MISSING,
  RETRY_OFFICIAL_EVALUATION_ROLE_SLOT_MISMATCH,
  RETRY_PREFLIGHT_BLOCKED,
  RETRY_SNAPSHOT_BASELINE_PIN_MISSING,
  RETRY_SNAPSHOT_CANDIDATE_BLOCKED,
  RETRY_STILL_FINISHING_ERROR,
  officialAdmissionBlockedReason,
  resolveEnqueuePostError,
  resolveRetryPostError,
  retryGate,
  retryNonRetryableBlockedReason,
  retryOfficialPilotBlockedReason,
  retrySnapshotGate,
  runDetailCanCancel,
  runDetailShouldPoll,
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
    const settled = cancelGate("budget_stop", true);
    expect(settled.allow).toBe(false);
    if (!settled.allow) {
      expect(settled.errorCode).toBe("cancel_run_already_finished");
    }
    const okDone = cancelGate("ok", true);
    expect(okDone.allow).toBe(false);
    if (!okDone.allow) {
      expect(okDone.errorCode).toBe("cancel_run_already_finished");
    }
    expect(cancelGate("failed", false).allow).toBe(false);
  });

  it("rejects unknown status with cancel_invalid_status", () => {
    const out = cancelGate("weird", false);
    expect(out.allow).toBe(false);
    if (!out.allow) {
      expect(out.errorCode).toBe("cancel_invalid_status");
      expect(out.error).toMatch(/weird/);
    }
  });
});

describe("resolveCancelPostError", () => {
  it("fail-closes known codes without body.error", () => {
    expect(
      resolveCancelPostError({ errorCode: "cancel_not_found" }),
    ).toBe(CANCEL_NOT_FOUND_ERROR);
    expect(
      resolveCancelPostError({ errorCode: "cancel_run_already_finished" }),
    ).toBe("run already finished");
    expect(
      resolveCancelPostError({ errorCode: "cancel_invalid_status" }),
    ).toBe("cannot cancel status");
    expect(resolveCancelPostError({ errorCode: "cancel_failed" })).toBe(
      CANCEL_FAILED_ERROR,
    );
    expect(
      resolveCancelPostError({ errorCode: "cancel_invalid_request" }),
    ).toBe("invalid request");
  });

  it("prefers body.error when present", () => {
    expect(
      resolveCancelPostError({
        errorCode: "cancel_run_already_finished",
        error: "run already finished (ok)",
      }),
    ).toBe("run already finished (ok)");
  });

  it("is used by RunDetailClient onCancel", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/app/runs/[runId]/RunDetailClient.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/resolveCancelPostError/);
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
  it("matches core retryDedup copy", () => {
    expect(RETRY_ENQUEUE_LOCK_BUSY_ERROR).toBe(
      CORE_RETRY_ENQUEUE_LOCK_BUSY_ERROR,
    );
  });
});

describe("retryNonRetryableBlockedReason", () => {
  it("matches core NON_RETRYABLE_ERROR_CODES", () => {
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

  it("fail-closes retry_failed / retry_invalid_request without body.error", () => {
    expect(
      resolveRetryPostError({ errorCode: "retry_failed" }, formatCost),
    ).toBe(RETRY_FAILED_ERROR);
    expect(
      resolveRetryPostError({ errorCode: "retry_invalid_request" }, formatCost),
    ).toBe("invalid request");
  });

  it("fail-closes early Retry gates without body.error", () => {
    expect(
      resolveRetryPostError({ errorCode: "retry_not_found" }, formatCost),
    ).toBe(RETRY_NOT_FOUND_ERROR);
    expect(
      resolveRetryPostError({ errorCode: "retry_invalid_status" }, formatCost),
    ).toBe(RETRY_INVALID_STATUS_ERROR);
    expect(
      resolveRetryPostError(
        {
          errorCode: "retry_invalid_status",
          error: "cannot retry status running",
        },
        formatCost,
      ),
    ).toBe("cannot retry status running");
    expect(
      resolveRetryPostError({ errorCode: "retry_config_missing" }, formatCost),
    ).toBe(RETRY_CONFIG_MISSING_ERROR);
    expect(
      resolveRetryPostError({ errorCode: "retry_non_retryable" }, formatCost),
    ).toBe(RETRY_NON_RETRYABLE_ERROR);
  });

  it("fail-closes enqueueRun errorCodes (distinct from retry_enqueue_lock_busy)", () => {
    expect(
      resolveRetryPostError({ errorCode: "enqueue_lock_busy" }, formatCost),
    ).toBe(RETRY_ENQUEUE_JOB_LOCK_BUSY);
    expect(
      resolveRetryPostError({ errorCode: "enqueue_queue_full" }, formatCost),
    ).toBe(RETRY_ENQUEUE_QUEUE_FULL);
    expect(
      resolveRetryPostError(
        { errorCode: "enqueue_skill_not_ready" },
        formatCost,
      ),
    ).toBe(RETRY_ENQUEUE_SKILL_NOT_READY);
    expect(
      resolveRetryPostError(
        {
          errorCode: "enqueue_queue_full",
          error: "queue full (max 20 pending jobs)",
        },
        formatCost,
      ),
    ).toBe("queue full (max 20 pending jobs)");
    // Must not collapse jobs/.enqueue.lock into the tip-link retry lock copy.
    expect(
      resolveRetryPostError({ errorCode: "enqueue_lock_busy" }, formatCost),
    ).not.toBe(RETRY_ENQUEUE_LOCK_BUSY_ERROR);
  });

  it("fail-closes snapshot gate codes without body.error", () => {
    expect(
      resolveRetryPostError(
        { errorCode: "retry_snapshot_candidate_blocked" },
        formatCost,
      ),
    ).toBe(RETRY_SNAPSHOT_CANDIDATE_BLOCKED);
    expect(
      resolveRetryPostError(
        { errorCode: "retry_snapshot_baseline_pin_missing" },
        formatCost,
      ),
    ).toBe(RETRY_SNAPSHOT_BASELINE_PIN_MISSING);
  });

  it("fail-closes retry_comparison_link_failed without body.error", () => {
    expect(
      resolveRetryPostError(
        { errorCode: "retry_comparison_link_failed" },
        formatCost,
      ),
    ).toBe(RETRY_COMPARISON_LINK_FAILED);
    expect(
      resolveRetryPostError(
        {
          errorCode: "retry_comparison_link_failed",
          error: "Comparison link update failed before enqueue — try again shortly",
        },
        formatCost,
      ),
    ).toMatch(/before enqueue/);
  });

  it("fail-closes evaluation meta revert and pair-meta codes", () => {
    expect(
      resolveRetryPostError(
        { errorCode: "evaluation_meta_revert_failed" },
        formatCost,
      ),
    ).toBe(RETRY_EVALUATION_META_REVERT_FAILED);
    expect(
      resolveRetryPostError(
        { errorCode: "official_evaluation_meta_missing" },
        formatCost,
      ),
    ).toBe(RETRY_OFFICIAL_EVALUATION_META_MISSING);
    expect(
      resolveRetryPostError(
        { errorCode: "official_evaluation_leg_mismatch" },
        formatCost,
      ),
    ).toBe(RETRY_OFFICIAL_EVALUATION_LEG_MISMATCH);
    expect(
      resolveRetryPostError(
        { errorCode: "official_evaluation_role_slot_mismatch" },
        formatCost,
      ),
    ).toBe(RETRY_OFFICIAL_EVALUATION_ROLE_SLOT_MISMATCH);
    expect(
      resolveRetryPostError(
        {
          errorCode: "official_evaluation_role_slot_mismatch",
          error: "retry role candidate does not match evaluation meta slot baseline",
        },
        formatCost,
      ),
    ).toMatch(/candidate.*baseline/);
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

  it("fail-closes official admission codes without body.error", () => {
    expect(
      resolveRetryPostError(
        { errorCode: "official_smoke_forbidden" },
        formatCost,
      ),
    ).toBe(OFFICIAL_ADMISSION_SMOKE_FORBIDDEN);
    expect(
      resolveRetryPostError(
        { errorCode: "official_host_grade_forbidden" },
        formatCost,
      ),
    ).toBe(OFFICIAL_ADMISSION_HOST_GRADE_FORBIDDEN);
    expect(
      resolveRetryPostError(
        { errorCode: "official_api_key_missing" },
        formatCost,
      ),
    ).toBe(OFFICIAL_ADMISSION_API_KEY_MISSING);
    expect(
      resolveRetryPostError(
        { errorCode: "official_web_auth_required" },
        formatCost,
      ),
    ).toBe(OFFICIAL_ADMISSION_WEB_AUTH_REQUIRED);
    expect(
      resolveRetryPostError(
        { errorCode: "official_pair_required" },
        formatCost,
      ),
    ).toBe(OFFICIAL_ADMISSION_PAIR_REQUIRED);
    expect(
      resolveRetryPostError(
        { errorCode: "official_repeats_too_low" },
        formatCost,
      ),
    ).toBe(OFFICIAL_ADMISSION_REPEATS_TOO_LOW);
    expect(
      resolveRetryPostError(
        { errorCode: "official_evaluation_required" },
        formatCost,
      ),
    ).toBe(OFFICIAL_ADMISSION_EVALUATION_REQUIRED);
    expect(
      resolveRetryPostError(
        {
          errorCode: "official_repeats_too_low",
          error: "official mode requires at least 3 repeats (got 1)",
        },
        formatCost,
      ),
    ).toMatch(/got 1/);
  });

  it("falls back to body.error or Retry failed", () => {
    expect(
      resolveRetryPostError({ error: "custom" }, formatCost),
    ).toBe("custom");
    expect(resolveRetryPostError({}, formatCost)).toBe("Retry failed");
  });

  it("is used by RunDetailClient onRetry and onCancel catch", async () => {
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
    expect(src).toMatch(/resolveCancelPostError/);
    expect(src).toMatch(/errorCode: "retry_failed"/);
    expect(src).toMatch(/errorCode: "cancel_failed"/);
    expect(src).not.toMatch(/setRetryError\("Retry failed"\)/);
    expect(src).not.toMatch(/setCancelError\("Cancel failed"\)/);
  });
});

describe("officialAdmissionBlockedReason", () => {
  it("matches core officialEnqueueAllowed static copy", () => {
    const smoke = officialEnqueueAllowed({
      mode: "official",
      env: { FAKE_PRODUCE: "known-good", OPENAI_API_KEY: "sk" },
    });
    expect(smoke.ok).toBe(false);
    if (smoke.ok) return;
    expect(smoke.error).toBe(OFFICIAL_ADMISSION_SMOKE_FORBIDDEN);

    const host = officialEnqueueAllowed({
      mode: "official",
      env: { ALLOW_HOST_GRADE: "1", OPENAI_API_KEY: "sk" },
    });
    expect(host.ok).toBe(false);
    if (host.ok) return;
    expect(host.error).toBe(OFFICIAL_ADMISSION_HOST_GRADE_FORBIDDEN);

    const key = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "" },
    });
    expect(key.ok).toBe(false);
    if (key.ok) return;
    expect(key.error).toBe(OFFICIAL_ADMISSION_API_KEY_MISSING);

    const pair = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "sk" },
      withBaseline: false,
    });
    expect(pair.ok).toBe(false);
    if (pair.ok) return;
    expect(pair.error).toBe(OFFICIAL_ADMISSION_PAIR_REQUIRED);

    const evalReq = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "sk" },
      requireEvaluationId: true,
    });
    expect(evalReq.ok).toBe(false);
    if (evalReq.ok) return;
    expect(evalReq.error).toBe(OFFICIAL_ADMISSION_EVALUATION_REQUIRED);

    const web = officialEnqueueAllowed({
      mode: "official",
      env: { OPENAI_API_KEY: "sk" },
      requireWebAuthConfigured: true,
      webAuthKind: "open",
    });
    expect(web.ok).toBe(false);
    if (web.ok) return;
    expect(web.error).toBe(OFFICIAL_ADMISSION_WEB_AUTH_REQUIRED);
  });
});

describe("resolveEnqueuePostError", () => {
  it("fail-closes enqueue codes and pair-only codes without body.error", () => {
    expect(
      resolveEnqueuePostError({ errorCode: "enqueue_lock_busy" }, formatCost),
    ).toBe(RETRY_ENQUEUE_JOB_LOCK_BUSY);
    expect(
      resolveEnqueuePostError({ errorCode: "enqueue_queue_full" }, formatCost),
    ).toBe(RETRY_ENQUEUE_QUEUE_FULL);
    expect(
      resolveEnqueuePostError(
        { errorCode: "enqueue_skill_not_ready" },
        formatCost,
      ),
    ).toBe(RETRY_ENQUEUE_SKILL_NOT_READY);
    expect(
      resolveEnqueuePostError(
        { errorCode: "enqueue_evaluation_meta_failed" },
        formatCost,
      ),
    ).toBe(ENQUEUE_EVALUATION_META_FAILED);
    expect(
      resolveEnqueuePostError(
        { errorCode: "enqueue_pair_candidate_failed" },
        formatCost,
      ),
    ).toBe(ENQUEUE_PAIR_CANDIDATE_FAILED);
  });

  it("maps preflight, official pilot, and cost-cap for new enqueue", () => {
    expect(
      resolveEnqueuePostError(
        { errorCode: "enqueue_preflight_blocked" },
        formatCost,
      ),
    ).toBe(ENQUEUE_PREFLIGHT_BLOCKED);
    expect(ENQUEUE_PREFLIGHT_BLOCKED).not.toBe(RETRY_PREFLIGHT_BLOCKED);
    expect(
      resolveEnqueuePostError(
        {
          errorCode: "official_pilot_not_ready",
          blockers: ["stale queue"],
        },
        formatCost,
      ),
    ).toMatch(/official mode blocked/);
    expect(
      resolveEnqueuePostError(
        { errorCode: "enqueue_cost_over_cap", costCapUsd: 0.5 },
        formatCost,
      ),
    ).toBe("cost-cap:0.5");
  });

  it("fail-closes official admission codes without body.error", () => {
    for (const [code, copy] of [
      ["official_smoke_forbidden", OFFICIAL_ADMISSION_SMOKE_FORBIDDEN],
      ["official_host_grade_forbidden", OFFICIAL_ADMISSION_HOST_GRADE_FORBIDDEN],
      ["official_api_key_missing", OFFICIAL_ADMISSION_API_KEY_MISSING],
      ["official_web_auth_required", OFFICIAL_ADMISSION_WEB_AUTH_REQUIRED],
      ["official_pair_required", OFFICIAL_ADMISSION_PAIR_REQUIRED],
      ["official_repeats_too_low", OFFICIAL_ADMISSION_REPEATS_TOO_LOW],
      ["official_evaluation_required", OFFICIAL_ADMISSION_EVALUATION_REQUIRED],
    ] as const) {
      expect(resolveEnqueuePostError({ errorCode: code }, formatCost)).toBe(
        copy,
      );
      expect(officialAdmissionBlockedReason(code)).toBe(copy);
    }
  });

  it("fail-closes enqueue_failed / enqueue_invalid_request without body.error", () => {
    expect(
      resolveEnqueuePostError({ errorCode: "enqueue_failed" }, formatCost),
    ).toBe(ENQUEUE_FAILED_ERROR);
    expect(
      resolveEnqueuePostError(
        { errorCode: "enqueue_invalid_request" },
        formatCost,
      ),
    ).toBe(ENQUEUE_INVALID_REQUEST_ERROR);
  });

  it("falls back to body.error or Enqueue failed", () => {
    expect(
      resolveEnqueuePostError({ error: "custom" }, formatCost),
    ).toBe("custom");
    expect(resolveEnqueuePostError({}, formatCost)).toBe(ENQUEUE_FAILED_ERROR);
  });

  it("is used by NewRunForm submit", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/app/NewRunForm.tsx"),
      "utf8",
    );
    expect(src).toMatch(/resolveEnqueuePostError/);
    expect(src).toMatch(/formatRetryCostBlockedReason/);
    expect(src).toMatch(/OFFICIAL_ADMISSION_PAIR_REQUIRED/);
    expect(src).toMatch(/errorCode: "enqueue_failed"/);
    expect(src).not.toMatch(/Failed to fetch/);
  });

  it("POST /api/runs uses enqueue_preflight_blocked and catch codes", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/runs/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/enqueue_preflight_blocked/);
    expect(src).toMatch(/ENQUEUE_PREFLIGHT_BLOCKED/);
    expect(src).toMatch(/paired\.errorCode/);
    expect(src).toMatch(/queued\.errorCode/);
    expect(src).toMatch(/enqueue_invalid_request/);
    expect(src).toMatch(/enqueue_failed/);
    expect(src).toMatch(/ENQUEUE_FAILED_ERROR/);
  });
});

describe("runDetailCanCancel", () => {
  it("allows orphan budget_stop wind-down even when not polling", () => {
    expect(
      runDetailCanCancel({ status: "budget_stop", hasResult: false }),
    ).toBe(true);
  });

  it("blocks settled budget_stop; allows cancel_requested resend", () => {
    expect(
      runDetailCanCancel({ status: "budget_stop", hasResult: true }),
    ).toBe(false);
    expect(
      runDetailCanCancel({
        status: "cancel_requested",
        hasResult: false,
      }),
    ).toBe(true);
    expect(
      runDetailCanCancel({
        status: "cancel_requested",
        hasResult: false,
        cancelling: true,
      }),
    ).toBe(false);
  });

  it("ignores pollError so Cancel stays available without live poll", () => {
    expect(
      runDetailCanCancel({
        status: "running",
        hasResult: false,
        pollError: true,
      }),
    ).toBe(true);
  });
});

describe("runDetailShouldPoll", () => {
  it("stops when result exists unless pairPending is waiting", () => {
    expect(
      runDetailShouldPoll({ status: "ok", hasResult: true }),
    ).toBe(false);
    expect(
      runDetailShouldPoll({
        status: "ok",
        hasResult: true,
        pairPending: "unavailable",
      }),
    ).toBe(false);
    expect(
      runDetailShouldPoll({
        status: "ok",
        hasResult: true,
        pairPending: "waiting",
      }),
    ).toBe(true);
  });

  it("keeps polling active statuses and budget_stop wind-down", () => {
    expect(
      runDetailShouldPoll({ status: "running", hasResult: false }),
    ).toBe(true);
    expect(
      runDetailShouldPoll({ status: "cancel_requested", hasResult: false }),
    ).toBe(true);
    expect(
      runDetailShouldPoll({ status: "budget_stop", hasResult: false }),
    ).toBe(true);
    expect(
      runDetailShouldPoll({ status: "failed", hasResult: false }),
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

  it("RunDetailClient keeps AlsoCancelledHint on result scorecard path", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/app/runs/[runId]/RunDetailClient.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/pairedCancelAlsoCopy/);
    expect(src).toMatch(/aria-label=\{pairedCancelAlsoCopy/);
    // Progress + result scorecard + cancelled-without-result.
    expect(src.match(/AlsoCancelledHint/g)?.length ?? 0).toBeGreaterThanOrEqual(
      3,
    );
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
    if (!g.allow) {
      expect(g.error).toBe(RETRY_STILL_FINISHING_ERROR);
      expect(g.errorCode).toBe("retry_still_finishing");
    }
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
    const running = retryGate({ status: "running", hasLiveJob: false });
    expect(running.allow).toBe(false);
    if (!running.allow) {
      expect(running.errorCode).toBe("retry_invalid_status");
      expect(running.error).toBe("cannot retry status running");
    }
    const nonRetry = retryGate({
      status: "failed",
      hasLiveJob: false,
      nonRetryableError: true,
    });
    expect(nonRetry.allow).toBe(false);
    if (!nonRetry.allow) {
      expect(nonRetry.errorCode).toBe("retry_non_retryable");
      expect(nonRetry.error).toBe(RETRY_NON_RETRYABLE_ERROR);
    }
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
    if (!emptyMd.allow) {
      expect(emptyMd.error).toBe(RETRY_SNAPSHOT_CANDIDATE_BLOCKED);
      expect(emptyMd.errorCode).toBe("retry_snapshot_candidate_blocked");
    }
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
    if (!missing.allow) {
      expect(missing.error).toBe(RETRY_SNAPSHOT_BASELINE_PIN_MISSING);
      expect(missing.errorCode).toBe("retry_snapshot_baseline_pin_missing");
    }
  });
});
