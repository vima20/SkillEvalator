import { describe, expect, it } from "vitest";
import { shouldUseHostGrade } from "./gradeMode.js";

describe("shouldUseHostGrade", () => {
  it("requires both allowHostGrade and FAKE_PRODUCE=known-good", () => {
    expect(
      shouldUseHostGrade({
        allowHostGrade: true,
        fakeProduce: "known-good",
      }),
    ).toBe(true);
    expect(
      shouldUseHostGrade({
        allowHostGrade: true,
        fakeProduce: undefined,
      }),
    ).toBe(false);
    expect(
      shouldUseHostGrade({
        allowHostGrade: false,
        fakeProduce: "known-good",
      }),
    ).toBe(false);
    expect(
      shouldUseHostGrade({
        allowHostGrade: true,
        fakeProduce: "other",
      }),
    ).toBe(false);
  });
});
