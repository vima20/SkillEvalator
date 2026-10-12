import { describe, expect, it } from "vitest";
import {
  liveRunStatusForProgress,
  resolveFinalRunStop,
  statusBadgeKind,
} from "./status.js";

describe("liveRunStatusForProgress", () => {
  it("stays running when idle", () => {
    expect(
      liveRunStatusForProgress({ stop: null, cancelFilePresent: false }),
    ).toBe("running");
  });

  it("surfaces cancel when file present or stop is cancelled", () => {
    expect(
      liveRunStatusForProgress({ stop: null, cancelFilePresent: true }),
    ).toBe("cancel_requested");
    expect(
      liveRunStatusForProgress({
        stop: "cancelled",
        cancelFilePresent: false,
      }),
    ).toBe("cancel_requested");
  });

  it("surfaces budget_stop mid-loop for UI wind-down", () => {
    expect(
      liveRunStatusForProgress({
        stop: "budget_stop",
        cancelFilePresent: false,
      }),
    ).toBe("budget_stop");
  });
});

describe("resolveFinalRunStop", () => {
  it("keeps null when no cancel file", () => {
    expect(
      resolveFinalRunStop({ stop: null, cancelFilePresent: false }),
    ).toBeNull();
  });

  it("turns late cancel into cancelled", () => {
    expect(
      resolveFinalRunStop({ stop: null, cancelFilePresent: true }),
    ).toBe("cancelled");
  });

  it("lets cancel win over budget_stop", () => {
    expect(
      resolveFinalRunStop({
        stop: "budget_stop",
        cancelFilePresent: true,
      }),
    ).toBe("cancelled");
  });

  it("preserves budget_stop without cancel", () => {
    expect(
      resolveFinalRunStop({
        stop: "budget_stop",
        cancelFilePresent: false,
      }),
    ).toBe("budget_stop");
  });
});

describe("statusBadgeKind", () => {
  it("treats cancel_requested as in-progress", () => {
    expect(statusBadgeKind("cancel_requested")).toBe("run");
  });
});
