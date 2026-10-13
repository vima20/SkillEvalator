import { describe, expect, it } from "vitest";
import {
  cancelGate,
  pairedCancelPeerStatuses,
  retryGate,
  retrySnapshotGate,
} from "./runLifecycle.js";

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

describe("retryGate", () => {
  it("blocks while a live job file is finishing", () => {
    const g = retryGate({
      status: "budget_stop",
      hasLiveJob: true,
    });
    expect(g.allow).toBe(false);
    if (!g.allow) expect(g.error).toMatch(/still finishing/);
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
  it("requires SKILL.md + version for candidate", () => {
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
