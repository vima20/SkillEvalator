import { describe, expect, it } from "vitest";
import { formatRunError } from "./results.js";

describe("formatRunError", () => {
  it("extracts OpenAI-style nested error message and code", () => {
    const formatted = formatRunError({
      status: 429,
      message: "429 Rate limit",
      error: {
        message: "You have no credits remaining.",
        code: "insufficient_quota",
      },
    });
    expect(formatted.error).toContain("no credits");
    expect(formatted.errorCode).toBe("insufficient_quota");
  });

  it("falls back to Error.message", () => {
    const formatted = formatRunError(new Error("boom"));
    expect(formatted.error).toBe("boom");
  });
});
