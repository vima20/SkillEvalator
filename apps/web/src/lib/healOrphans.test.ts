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

  it("keeps client refresh components free of healOrphans (no node:child_process)", () => {
    // Importing healOrphans → @skillevalator/core barrel → dockerGrade →
    // child_process breaks the client webpack graph (GET /api/preflight 500).
    // Subpath imports (@skillevalator/core/costEstimate) stay allowed.
    for (const rel of [
      "src/components/RunsAutoRefresh.tsx",
      "src/components/BenefitPending.tsx",
      "src/components/ComparisonPending.tsx",
      "src/app/runs/[runId]/RunDetailClient.tsx",
      "src/app/NewRunForm.tsx",
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/healOrphans/);
      expect(src).not.toMatch(/from ["']@skillevalator\/core["']/);
    }
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

  it("documents run-detail admission opts out of full heal (healQueue false)", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/app/runs/[runId]/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/healQueue:\s*false/);
    const detailApi = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/runs/[runId]/route.ts"),
      "utf8",
    );
    expect(detailApi).toMatch(/healQueue:\s*false/);
    const admission = fs.readFileSync(
      path.join(process.cwd(), "src/lib/runDetailRetryAdmission.ts"),
      "utf8",
    );
    expect(admission).toMatch(/healQueue === true/);
    expect(admission).not.toMatch(/healQueue !== false/);
  });
});

describe("runDetailRetryAdmissionForRun healQueue", () => {
  it("default does not stamp orphan budget_stop; healQueue true does", async () => {
    const { runDetailRetryAdmissionForRun } = await import(
      "./runDetailRetryAdmission.js"
    );
    const runId = "run_wd_admit1";
    writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
      runId,
      status: "budget_stop",
      role: "candidate",
      evaluationId: "eval_wd_admit1",
    });
    const preflight = {
      ok: true,
      fakeProduce: false,
      costCapUsd: 5,
      checks: {
        openaiApiKey: { ok: true, detail: "ok" },
        docker: { ok: true, detail: "ok" },
        worker: { ok: true, detail: "ok" },
      },
      checkedAt: new Date().toISOString(),
    };

    runDetailRetryAdmissionForRun({
      runId,
      status: { status: "budget_stop", evaluationId: "eval_wd_admit1" },
      result: null,
      preflight: preflight as import("@/lib/runPreflight").RunPreflightResult,
      staleRunningRunIds: [],
      healedMeta: null,
      snapshotFlags: { hasSkillMd: true, hasPinnedVersion: true },
    });
    let st: { status: string; errorCode?: string } = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    );
    expect(st.status).toBe("budget_stop");

    runDetailRetryAdmissionForRun({
      runId,
      status: { status: "budget_stop", evaluationId: "eval_wd_admit1" },
      result: null,
      preflight: preflight as import("@/lib/runPreflight").RunPreflightResult,
      healQueue: true,
      staleRunningRunIds: [],
      healedMeta: null,
      snapshotFlags: { hasSkillMd: true, hasPinnedVersion: true },
    });
    st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(st.status).toBe("failed");
    expect(st.errorCode).toBe("orphan_budget_stop");
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
