import { describe, expect, it } from "vitest";
import { resolveRunModelId } from "./resolveRunModel.js";

const opts = {
  modelDryRun: "gpt-4o-mini",
  modelOfficial: "gpt-4.1-mini",
};

describe("resolveRunModelId", () => {
  it("defaults to the mode-pinned model", () => {
    expect(
      resolveRunModelId({ mode: "dry-run", ...opts }),
    ).toBe("gpt-4o-mini");
    expect(
      resolveRunModelId({ mode: "official", ...opts }),
    ).toBe("gpt-4.1-mini");
  });

  it("accepts an explicit model that matches mode", () => {
    expect(
      resolveRunModelId({
        mode: "dry-run",
        jobModelId: "gpt-4o-mini",
        ...opts,
      }),
    ).toBe("gpt-4o-mini");
  });

  it("rejects dry-run with the official model", () => {
    expect(() =>
      resolveRunModelId({
        mode: "dry-run",
        jobModelId: "gpt-4.1-mini",
        ...opts,
      }),
    ).toThrow(/incompatible with mode dry-run/);
  });

  it("rejects official with the dry-run model", () => {
    expect(() =>
      resolveRunModelId({
        mode: "official",
        jobModelId: "gpt-4o-mini",
        ...opts,
      }),
    ).toThrow(/incompatible with mode official/);
  });

  it("rejects unknown modelIds", () => {
    expect(() =>
      resolveRunModelId({
        mode: "dry-run",
        jobModelId: "gpt-unknown",
        ...opts,
      }),
    ).toThrow(/not allowlisted/);
  });
});
