import { describe, expect, it } from "vitest";
import { checkOpenAiApiKey, runPreflight } from "./runPreflight.js";

describe("checkOpenAiApiKey", () => {
  it("passes when FAKE_PRODUCE=known-good without API key", () => {
    const { check, fakeProduce } = checkOpenAiApiKey({
      FAKE_PRODUCE: "known-good",
    });
    expect(fakeProduce).toBe(true);
    expect(check.ok).toBe(true);
  });

  it("fails when key missing and not smoke", () => {
    const { check, fakeProduce } = checkOpenAiApiKey({
      FAKE_PRODUCE: "",
      OPENAI_API_KEY: "",
    });
    expect(fakeProduce).toBe(false);
    expect(check.ok).toBe(false);
  });

  it("passes when OPENAI_API_KEY is set", () => {
    const { check } = checkOpenAiApiKey({
      OPENAI_API_KEY: "sk-test",
    });
    expect(check.ok).toBe(true);
  });
});

describe("runPreflight", () => {
  it("ok when all injected checks pass", () => {
    const out = runPreflight({
      env: { OPENAI_API_KEY: "sk-test", COST_CAP_USD: "3" },
      docker: { ok: true, detail: "ok" },
      worker: { ok: true, detail: "ok" },
      repoRoot: process.cwd(),
    });
    expect(out.ok).toBe(true);
    expect(out.costCapUsd).toBe(3);
    expect(out.fakeProduce).toBe(false);
  });

  it("not ok when worker fails (no enqueue gate)", () => {
    const out = runPreflight({
      env: { FAKE_PRODUCE: "known-good" },
      docker: { ok: true, detail: "ok" },
      worker: { ok: false, detail: "No worker heartbeat" },
      repoRoot: process.cwd(),
    });
    expect(out.ok).toBe(false);
    expect(out.checks.worker.ok).toBe(false);
    expect(out.checks.openaiApiKey.ok).toBe(true);
  });

  it("not ok when docker fails even with smoke key", () => {
    const out = runPreflight({
      env: { FAKE_PRODUCE: "known-good" },
      docker: { ok: false, detail: "daemon down" },
      worker: { ok: true, detail: "ok" },
      repoRoot: process.cwd(),
    });
    expect(out.ok).toBe(false);
    expect(out.checks.docker.ok).toBe(false);
  });
});
