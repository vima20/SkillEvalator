import { describe, expect, it } from "vitest";
import { loadSettingsSnapshot } from "./settingsSnapshot.js";

const okPreflight = {
  ok: true,
  fakeProduce: false,
  costCapUsd: 5,
  checks: {
    openaiApiKey: { ok: true, detail: "OPENAI_API_KEY is set" },
    docker: { ok: true, detail: "Docker daemon reachable" },
    worker: { ok: true, detail: "Worker alive (pid 1)" },
  },
  checkedAt: "2026-10-15T00:00:00.000Z",
};

describe("loadSettingsSnapshot", () => {
  it("marks pilot ready when preflight ok and smoke off", () => {
    const s = loadSettingsSnapshot({
      env: {
        OPENAI_API_KEY: "sk-test",
        MODEL_DRY_RUN: "gpt-4o-mini",
        MODEL_OFFICIAL: "gpt-4.1-mini",
        COST_CAP_USD: "8",
        COST_HARD_STOP: "true",
        WEB_AUTH_TOKEN: "secret",
        OFFICIAL_REQUIRES_WEB_AUTH: "true",
      },
      preflight: okPreflight,
      repoRoot: process.cwd(),
    });
    expect(s.pilotReady).toBe(true);
    expect(s.pilotBlockers).toEqual([]);
    expect(s.models.official).toBe("gpt-4.1-mini");
    expect(s.cost.costCapUsd).toBe(8);
    expect(s.auth.webAuthEnabled).toBe(true);
    expect(s.auth.officialRequiresWebAuth).toBe(true);
    expect(s.smoke.fakeProduce).toBe(false);
    expect(s.editableVia).toBe(".env");
    expect(s.skills.rows.length).toBeGreaterThanOrEqual(0);
  });

  it("lists injected skills as read-only rows", () => {
    const s = loadSettingsSnapshot({
      env: { OPENAI_API_KEY: "sk-test" },
      preflight: okPreflight,
      repoRoot: process.cwd(),
      skills: {
        bundled: [
          {
            id: "code-debugging-eval",
            githubUrl: "https://github.com/acme/x",
            taskSetId: "cde-v1",
            dryRunCount: 2,
            taskCount: 8,
            license: "MIT",
          },
        ],
        imported: [
          {
            id: "imported-skill",
            githubUrl: "https://github.com/acme/y",
            taskSetId: "cde-v1",
            dryRunCount: 1,
            taskCount: 3,
            license: "Apache-2.0",
          },
        ],
      },
    });
    expect(s.skills.bundledCount).toBe(1);
    expect(s.skills.importedCount).toBe(1);
    expect(s.skills.rows.map((r) => r.id).sort()).toEqual([
      "code-debugging-eval",
      "imported-skill",
    ]);
    expect(s.skills.rows.find((r) => r.id === "imported-skill")?.source).toBe(
      "imported",
    );
  });

  it("blocks pilot when FAKE_PRODUCE is set", () => {
    const s = loadSettingsSnapshot({
      env: {
        FAKE_PRODUCE: "known-good",
        OPENAI_API_KEY: "sk-test",
      },
      preflight: { ...okPreflight, fakeProduce: true },
      repoRoot: process.cwd(),
    });
    expect(s.pilotReady).toBe(false);
    expect(s.smoke.blocksOfficial).toBe(true);
    expect(
      s.pilotBlockers.some((b) => /FAKE_PRODUCE/i.test(b)),
    ).toBe(true);
  });

  it("never exposes secret values", () => {
    const s = loadSettingsSnapshot({
      env: {
        OPENAI_API_KEY: "sk-super-secret",
        WEB_AUTH_TOKEN: "auth-secret-value",
      },
      preflight: okPreflight,
      repoRoot: process.cwd(),
    });
    const json = JSON.stringify(s);
    expect(json).not.toContain("sk-super-secret");
    expect(json).not.toContain("auth-secret-value");
  });

  it("flags officialRequiresWebAuth without token", () => {
    const s = loadSettingsSnapshot({
      env: {
        OPENAI_API_KEY: "sk-test",
        OFFICIAL_REQUIRES_WEB_AUTH: "true",
      },
      preflight: okPreflight,
      repoRoot: process.cwd(),
    });
    expect(s.pilotReady).toBe(false);
    expect(
      s.pilotBlockers.some((b) => /OFFICIAL_REQUIRES_WEB_AUTH/i.test(b)),
    ).toBe(true);
  });
});
