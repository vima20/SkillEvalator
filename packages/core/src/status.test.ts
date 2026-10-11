import { describe, expect, it } from "vitest";
import { liveRunStatusForProgress, statusBadgeKind } from "./status.js";

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

  it("keeps running during budget_stop mid-loop", () => {
    expect(
      liveRunStatusForProgress({
        stop: "budget_stop",
        cancelFilePresent: false,
      }),
    ).toBe("running");
  });
});

describe("statusBadgeKind", () => {
  it("treats cancel_requested as in-progress", () => {
    expect(statusBadgeKind("cancel_requested")).toBe("run");
  });
});
