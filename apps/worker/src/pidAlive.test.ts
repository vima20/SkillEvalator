import { describe, expect, it } from "vitest";
import { isPidAlive } from "./pidAlive.js";

describe("isPidAlive", () => {
  it("rejects non-positive and non-integer pids", () => {
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-1)).toBe(false);
    expect(isPidAlive(1.5)).toBe(false);
  });

  it("sees the current process as alive", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it("returns false for a very unlikely live pid", () => {
    // PID 1 may exist on Unix; use a high unused value that kill(0) rejects.
    expect(isPidAlive(2_147_483_646)).toBe(false);
  });
});
