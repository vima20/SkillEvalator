import { describe, expect, it } from "vitest";
import {
  resolveProduceInstruction,
  resolveProduceSystemContent,
} from "./produceInstruction.js";
import { BASELINE_NEUTRAL_PROMPT } from "./prompts.js";

describe("resolveProduceInstruction", () => {
  it("uses neutral prompt for baseline", () => {
    const r = resolveProduceInstruction({
      role: "baseline",
      skillMd: "# skill body",
    });
    expect(r.promptKind).toBe("baseline_neutral");
    expect(r.instruction).toBe(BASELINE_NEUTRAL_PROMPT);
  });

  it("uses skillMd for candidate", () => {
    const r = resolveProduceInstruction({
      role: "candidate",
      skillMd: "  # fix bugs\n",
    });
    expect(r.promptKind).toBe("skill_md");
    expect(r.instruction).toBe("# fix bugs");
  });

  it("falls back to neutral when candidate skillMd is empty", () => {
    const r = resolveProduceInstruction({ role: "candidate", skillMd: "  " });
    expect(r.promptKind).toBe("skill_md");
    expect(r.instruction).toBe(BASELINE_NEUTRAL_PROMPT);
  });
});

describe("resolveProduceSystemContent", () => {
  it("differs for baseline vs candidate", () => {
    expect(resolveProduceSystemContent("baseline")).toMatch(/neutral/i);
    expect(resolveProduceSystemContent("candidate")).toMatch(/skill/i);
  });
});
