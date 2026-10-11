import path from "node:path";
import { describe, expect, it } from "vitest";
import { decideDockerGradeAbort, toDockerBindPath } from "./dockerGrade.js";

describe("toDockerBindPath", () => {
  it("converts Windows drive paths for Docker Desktop", () => {
    if (process.platform !== "win32") return;
    const out = toDockerBindPath("C:\\Users\\test\\data");
    expect(out.startsWith("/c/")).toBe(true);
    expect(out.includes("\\")).toBe(false);
  });

  it("keeps posix absolute paths", () => {
    if (process.platform === "win32") return;
    expect(toDockerBindPath("/tmp/se-grade")).toBe(
      path.resolve("/tmp/se-grade"),
    );
  });
});

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
