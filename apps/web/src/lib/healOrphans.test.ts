import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJsonFile } from "@skillevalator/core";

const temps: string[] = [];
let jobsRoot = "";
let resultsRoot = "";

vi.mock("@/lib/paths", () => ({
  jobsDir: () => jobsRoot,
  resultsDir: () => resultsRoot,
  skillsDirs: () => [],
  skillsDir: () => "",
  importedSkillsDir: () => path.join(resultsRoot, "imported"),
  repoRoot: () => resultsRoot,
}));

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  vi.resetModules();
});

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-heal-read-"));
  temps.push(root);
  jobsRoot = path.join(root, "jobs");
  resultsRoot = path.join(root, "results");
  fs.mkdirSync(jobsRoot, { recursive: true });
  fs.mkdirSync(resultsRoot, { recursive: true });
});

describe("healOrphansForBrowse vs healOrphanStatuses", () => {
  it("browse keeps orphan budget_stop; full heal stamps failed", async () => {
    const { healOrphansForBrowse, healOrphanStatuses } = await import(
      "./healOrphans.js"
    );
    const runId = "run_wd_browse1";
    writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
      runId,
      status: "budget_stop",
      role: "candidate",
      evaluationId: "eval_wd_browse1",
    });

    healOrphansForBrowse();
    let st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(st.status).toBe("budget_stop");
    expect(st.errorCode).toBeUndefined();

    healOrphanStatuses();
    st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(st.status).toBe("failed");
    expect(st.errorCode).toBe("orphan_budget_stop");
  });

  it("documents preflight/Settings SSR must use browse (not full) heal", async () => {
    // Regression guard: passive poll must not call healOrphanStatuses.
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/app/api/preflight/route.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/healOrphansForBrowse/);
    expect(src).not.toMatch(/healOrphanStatuses\s*\(/);
    const settings = fs.readFileSync(
      path.join(process.cwd(), "src/app/settings/page.tsx"),
      "utf8",
    );
    expect(settings).toMatch(/healOrphansForBrowse/);
    expect(settings).not.toMatch(/healOrphanStatuses\s*\(/);
  });

  it("documents Settings silent poll omits heal=1; Refresh keeps it", async () => {
    const client = fs.readFileSync(
      path.join(process.cwd(), "src/app/settings/SettingsClient.tsx"),
      "utf8",
    );
    expect(client).toMatch(/silent \? "\/api\/settings"/);
    expect(client).toMatch(/\/api\/settings\?heal=1/);
    const route = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/settings/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/healOrphansForBrowse/);
    expect(route).toMatch(/healQueue:\s*true/);
  });
});

describe("healRunForRead vs healRunForFinalize", () => {
  it("read heal keeps orphan budget_stop; finalize stamps failed", async () => {
    const { healRunForRead, healRunForFinalize } = await import(
      "./healOrphans.js"
    );
    const runId = "run_wd_heal1";
    writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
      runId,
      status: "budget_stop",
      role: "candidate",
      evaluationId: "eval_wd_heal1",
    });

    healRunForRead(runId);
    let st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(st.status).toBe("budget_stop");
    expect(st.errorCode).toBeUndefined();

    healRunForFinalize(runId);
    st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(st.status).toBe("failed");
    expect(st.errorCode).toBe("orphan_budget_stop");
  });

  it("read and finalize are noop when budget_stop still has a job file", async () => {
    const { healRunForRead, healRunForFinalize } = await import(
      "./healOrphans.js"
    );
    const runId = "run_wd_livejob";
    writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
      runId,
      status: "budget_stop",
    });
    // Queued/claimed job file — not a dead .running.json (reclaim would remove that).
    fs.writeFileSync(path.join(jobsRoot, `${runId}.json`), "{}\n");

    healRunForRead(runId);
    healRunForFinalize(runId);
    const st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string };
    expect(st.status).toBe("budget_stop");
  });
});
