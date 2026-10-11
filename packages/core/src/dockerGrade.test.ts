import { describe, expect, it } from "vitest";
import { decideDockerGradeAbort } from "./dockerGrade.js";

describe("decideDockerGradeAbort", () => {
  it("prefers cancel over timeout", () => {
    expect(
      decideDockerGradeAbort({ cancelRequested: true, timedOut: true }),
    ).toBe("cancel");
  });

  it("reports timeout when not cancelled", () => {
    expect(
      decideDockerGradeAbort({ cancelRequested: false, timedOut: true }),
    ).toBe("timeout");
  });

  it("returns null for normal completion", () => {
    expect(
      decideDockerGradeAbort({ cancelRequested: false, timedOut: false }),
    ).toBe(null);
  });
});
