import { describe, expect, it } from "vitest";
import { stripCodeFences } from "./llmOutput.js";

describe("stripCodeFences", () => {
  it("prefers the last javascript fence", () => {
    const raw = [
      "Here is a sketch:",
      "```js",
      "function wrong() {}",
      "```",
      "Final file:",
      "```javascript",
      "export function sum(a, b) { return a + b }",
      "```",
    ].join("\n");
    expect(stripCodeFences(raw)).toBe(
      "export function sum(a, b) { return a + b }\n",
    );
  });

  it("returns trimmed body when no fences", () => {
    expect(stripCodeFences("  const x = 1  ")).toBe("const x = 1\n");
  });
});
