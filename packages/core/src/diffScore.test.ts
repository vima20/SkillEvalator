import { describe, expect, it } from "vitest";
import {
  DIFF_STRONG_MAX,
  scoreFromGradeAndDiff,
  textDiffRatio,
} from "./diffScore.js";

describe("textDiffRatio", () => {
  it("is zero for identical text", () => {
    expect(textDiffRatio("abc\n", "abc\n")).toBe(0);
  });

  it("is one for empty vs non-empty", () => {
    expect(textDiffRatio("", "hello")).toBe(1);
  });

  it("grows with edits", () => {
    const small = textDiffRatio("function sum(a,b){return a+b}", "function sum(a,b){return a+b}");
    const big = textDiffRatio("function sum(a,b){return a+b}", "function sum(a,b){return a-b}");
    expect(small).toBe(0);
    expect(big).toBeGreaterThan(0);
    expect(big).toBeLessThan(0.2);
  });
});

describe("scoreFromGradeAndDiff", () => {
  it("fails when grade fails", () => {
    expect(scoreFromGradeAndDiff(false, 0)).toBe(0);
  });

  it("gives full credit when identical", () => {
    expect(scoreFromGradeAndDiff(true, 0)).toBe(1);
  });

  it("gives partial credit for large diffs", () => {
    const s = scoreFromGradeAndDiff(true, 1);
    expect(s).toBe(0.8);
  });

  it("treats null diff as full pass", () => {
    expect(scoreFromGradeAndDiff(true, null)).toBe(1);
  });

  it("strong threshold is tight", () => {
    expect(DIFF_STRONG_MAX).toBeLessThan(0.2);
  });
});
