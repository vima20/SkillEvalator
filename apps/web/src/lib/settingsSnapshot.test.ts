import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadSettingsSnapshot,
  summarizeJobQueue,
} from "./settingsSnapshot.js";
import { isSettingsSnapshot } from "./settingsTypes.js";

const injectedBuild = {
  gitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  gitShaShort: "aaaaaaa",
  dirty: false,
};

const injectedQueue = {
  queued: 0,
  running: 0,
  activeRunId: null as string | null,
  staleRunningRunIds: [] as string[],
};

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
      build: injectedBuild,
      queue: injectedQueue,
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
    expect(s.adoption.officialMinRepeats).toBe(3);
    expect(s.adoption.officialUseScoreFloor).toBe(0.99);
    expect(s.adoption.softPassScoreFloor).toBe(0.8);
    expect(s.adoption.liftPassDelta).toBe(0.05);
    expect(s.grade.livePolicy).toBe("docker_script");
    expect(s.grade.hostGradeOnlyWithFakeProduce).toBe(true);
    expect(s.web.bindHint).toMatch(/127\.0\.0\.1|loopback/i);
  });

  it("lists injected skills as read-only rows", () => {
    const s = loadSettingsSnapshot({
      env: { OPENAI_API_KEY: "sk-test" },
      preflight: okPreflight,
      repoRoot: process.cwd(),
      build: injectedBuild,
      queue: injectedQueue,
      skills: {
        bundled: [
          {
            id: "code-debugging-eval",
            githubUrl: "https://github.com/acme/x",
            taskSetId: "cde-v1",
            dryRunCount: 2,
            taskCount: 8,
            license: "MIT",
            dependencies: [],
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
            dependencies: [],
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
      build: injectedBuild,
      queue: injectedQueue,
    });
    expect(s.pilotReady).toBe(false);
    expect(s.smoke.blocksOfficial).toBe(true);
    expect(
      s.pilotBlockers.some((b) => /FAKE_PRODUCE/i.test(b)),
    ).toBe(true);
  });

  it("blocks pilot when ALLOW_HOST_GRADE=1", () => {
    const s = loadSettingsSnapshot({
      env: {
        ALLOW_HOST_GRADE: "1",
        OPENAI_API_KEY: "sk-test",
        WEB_AUTH_TOKEN: "secret",
      },
      preflight: okPreflight,
      repoRoot: process.cwd(),
      build: injectedBuild,
      queue: injectedQueue,
    });
    expect(s.pilotReady).toBe(false);
    expect(s.smoke.allowHostGrade).toBe(true);
    expect(s.smoke.blocksOfficial).toBe(true);
    expect(
      s.pilotBlockers.some((b) => /ALLOW_HOST_GRADE/i.test(b)),
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
      build: injectedBuild,
      queue: injectedQueue,
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
      build: injectedBuild,
      queue: injectedQueue,
    });
    expect(s.pilotReady).toBe(false);
    expect(
      s.pilotBlockers.some((b) => /OFFICIAL_REQUIRES_WEB_AUTH/i.test(b)),
    ).toBe(true);
  });

  it("produces a payload accepted by isSettingsSnapshot", () => {
    const s = loadSettingsSnapshot({
      env: { OPENAI_API_KEY: "sk-test" },
      preflight: okPreflight,
      repoRoot: process.cwd(),
      skills: { bundled: [], imported: [] },
      build: injectedBuild,
      queue: injectedQueue,
    });
    expect(isSettingsSnapshot(s)).toBe(true);
    expect(s.build.gitShaShort).toBe("aaaaaaa");
    expect(s.queue.queued).toBe(0);
    expect(isSettingsSnapshot(null)).toBe(false);
    expect(isSettingsSnapshot({ editableVia: ".env" })).toBe(false);
  });

  it("summarizeJobQueue counts queued/running and active run", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "se-queue-"));
    try {
      fs.writeFileSync(path.join(dir, "run_a.json"), "{}");
      fs.writeFileSync(path.join(dir, "run_b.running.json"), "{}");
      fs.writeFileSync(path.join(dir, "run_c.done.json"), "{}");
      fs.writeFileSync(path.join(dir, "run_d.tmp.json"), "{}");
      fs.writeFileSync(
        path.join(dir, ".worker"),
        JSON.stringify({ busy: true, runId: "run_b", pid: 1, at: new Date().toISOString() }),
      );
      expect(summarizeJobQueue(dir)).toEqual({
        queued: 1,
        running: 1,
        activeRunId: "run_b",
        staleRunningRunIds: [],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
