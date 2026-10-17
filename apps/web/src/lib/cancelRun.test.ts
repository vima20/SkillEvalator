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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-cancel-run-"));
  temps.push(root);
  jobsRoot = path.join(root, "jobs");
  resultsRoot = path.join(root, "results");
  fs.mkdirSync(jobsRoot, { recursive: true });
  fs.mkdirSync(resultsRoot, { recursive: true });
});

function writeStatus(
  runId: string,
  body: Record<string, unknown>,
): void {
  writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
    runId,
    ...body,
  });
}

function writeFailedJob(
  runId: string,
  evaluationId: string,
  role: "baseline" | "candidate",
): void {
  writeJsonFile(path.join(jobsRoot, `${runId}.failed.json`), {
    runId,
    evalSkillId: "skill_demo",
    mode: "dry-run",
    repeats: 1,
    role,
    evaluationId,
    createdAt: new Date().toISOString(),
  });
}

describe("requestCancelOne", () => {
  it("cancels queued job immediately and keeps pairing meta", async () => {
    const { requestCancelOne } = await import("./cancelRun.js");
    const runId = "run_q1_immediate";
    writeStatus(runId, {
      status: "queued",
      role: "candidate",
      evaluationId: "eval_pair_q1",
    });
    fs.writeFileSync(path.join(jobsRoot, `${runId}.json`), "{}\n");

    const out = requestCancelOne(runId, {
      evaluationId: "eval_pair_q1",
      role: "candidate",
    });
    expect(out).toEqual({ ok: true, status: "cancelled" });
    expect(fs.existsSync(path.join(jobsRoot, `${runId}.cancel`))).toBe(true);
    expect(fs.existsSync(path.join(jobsRoot, `${runId}.json`))).toBe(false);
    expect(fs.existsSync(path.join(jobsRoot, `${runId}.cancelled.json`))).toBe(
      true,
    );
    const st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; evaluationId?: string; role?: string };
    expect(st).toMatchObject({
      status: "cancelled",
      evaluationId: "eval_pair_q1",
      role: "candidate",
    });
  });

  it("marks running as cancel_requested without renaming queued job", async () => {
    const { requestCancelOne } = await import("./cancelRun.js");
    const runId = "run_r1_running";
    writeStatus(runId, {
      status: "running",
      role: "baseline",
      evaluationId: "eval_pair_r1",
      costUsd: 0.12,
    });

    const out = requestCancelOne(runId, {
      evaluationId: "eval_pair_r1",
      role: "baseline",
    });
    expect(out).toEqual({ ok: true, status: "cancel_requested" });
    expect(fs.existsSync(path.join(jobsRoot, `${runId}.cancel`))).toBe(true);
    expect(fs.existsSync(path.join(jobsRoot, `${runId}.cancelled.json`))).toBe(
      false,
    );
    const st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; costUsd?: number; evaluationId?: string };
    expect(st.status).toBe("cancel_requested");
    expect(st.costUsd).toBe(0.12);
    expect(st.evaluationId).toBe("eval_pair_r1");
  });

  it("rejects settled budget_stop with result.json", async () => {
    const { requestCancelOne } = await import("./cancelRun.js");
    const runId = "run_b1_settled";
    writeStatus(runId, { status: "budget_stop" });
    writeJsonFile(path.join(resultsRoot, runId, "result.json"), {
      runId,
      score: 0,
    });

    expect(requestCancelOne(runId)).toMatchObject({
      ok: false,
      status: 409,
    });
  });
});

describe("cancelRunWithCascade", () => {
  it("cascades to queued sibling sharing evaluationId", async () => {
    const { cancelRunWithCascade } = await import("./cancelRun.js");
    const evaluationId = "eval_cascade_1";
    const base = "run_c1_base";
    const cand = "run_c1_cand";

    writeStatus(base, {
      status: "queued",
      role: "baseline",
      evaluationId,
    });
    fs.writeFileSync(path.join(jobsRoot, `${base}.json`), "{}\n");
    writeStatus(cand, {
      status: "queued",
      role: "candidate",
      evaluationId,
    });
    fs.writeFileSync(path.join(jobsRoot, `${cand}.json`), "{}\n");

    const out = cancelRunWithCascade(base);
    expect(out).toMatchObject({
      ok: true,
      runId: base,
      status: "cancelled",
      alsoCancelled: cand,
    });
    const candSt = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, cand, "status.json"), "utf8"),
    ) as { status: string };
    expect(candSt.status).toBe("cancelled");
    expect(fs.existsSync(path.join(jobsRoot, `${cand}.cancelled.json`))).toBe(
      true,
    );
  });

  it("resolves evaluationId from failed job when status lacks it", async () => {
    const { cancelRunWithCascade } = await import("./cancelRun.js");
    const evaluationId = "eval_cascade_job";
    const base = "run_c2_base";
    const cand = "run_c2_cand";

    // Primary: queued (cancellable) without status.evaluationId; id only on
    // failed job artifact (status → job → result). Keep live .json so cancel
    // is immediate and heal does not stamp failed.
    writeStatus(base, { status: "queued", role: "baseline" });
    writeFailedJob(base, evaluationId, "baseline");
    fs.writeFileSync(path.join(jobsRoot, `${base}.json`), "{}\n");
    writeStatus(cand, {
      status: "queued",
      role: "candidate",
      evaluationId,
    });
    fs.writeFileSync(path.join(jobsRoot, `${cand}.json`), "{}\n");

    const out = cancelRunWithCascade(base);
    expect(out).toMatchObject({
      ok: true,
      runId: base,
      status: "cancelled",
      alsoCancelled: cand,
    });
    const baseSt = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, base, "status.json"), "utf8"),
    ) as { evaluationId?: string };
    expect(baseSt.evaluationId).toBe(evaluationId);
  });

  it("cascades when evaluationId is only on live queued .json", async () => {
    const { cancelRunWithCascade } = await import("./cancelRun.js");
    const evaluationId = "eval_cascade_live";
    const base = "run_c2_live_b";
    const cand = "run_c2_live_c";

    writeStatus(base, { status: "queued", role: "baseline" });
    writeJsonFile(path.join(jobsRoot, `${base}.json`), {
      runId: base,
      evalSkillId: "skill_demo",
      mode: "dry-run",
      repeats: 1,
      role: "baseline",
      evaluationId,
      createdAt: new Date().toISOString(),
    });
    writeStatus(cand, {
      status: "queued",
      role: "candidate",
      evaluationId,
    });
    fs.writeFileSync(path.join(jobsRoot, `${cand}.json`), "{}\n");

    const out = cancelRunWithCascade(base);
    expect(out).toMatchObject({
      ok: true,
      runId: base,
      status: "cancelled",
      alsoCancelled: cand,
    });
    const baseSt = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, base, "status.json"), "utf8"),
    ) as { evaluationId?: string };
    expect(baseSt.evaluationId).toBe(evaluationId);
  });

  it("cancels orphan budget_stop wind-down without healing to failed first", async () => {
    const { cancelRunWithCascade } = await import("./cancelRun.js");
    const runId = "run_wd_primary";
    writeStatus(runId, {
      status: "budget_stop",
      role: "candidate",
      evaluationId: "eval_wd_solo",
    });

    const out = cancelRunWithCascade(runId);
    expect(out).toMatchObject({
      ok: true,
      runId,
      status: "cancel_requested",
    });
    const st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string };
    expect(st.status).toBe("cancel_requested");
  });

  it("cascades wind-down budget_stop sibling without result.json", async () => {
    const { cancelRunWithCascade } = await import("./cancelRun.js");
    const evaluationId = "eval_cascade_wd";
    const base = "run_c3_base";
    const cand = "run_c3_cand";

    writeStatus(base, {
      status: "queued",
      role: "baseline",
      evaluationId,
    });
    fs.writeFileSync(path.join(jobsRoot, `${base}.json`), "{}\n");
    writeStatus(cand, {
      status: "budget_stop",
      role: "candidate",
      evaluationId,
    });

    const out = cancelRunWithCascade(base);
    expect(out).toMatchObject({
      ok: true,
      alsoCancelled: cand,
    });
    const candSt = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, cand, "status.json"), "utf8"),
    ) as { status: string };
    expect(candSt.status).toBe("cancel_requested");
  });

  it("still cascades when primary was already cancelled", async () => {
    const { cancelRunWithCascade } = await import("./cancelRun.js");
    const evaluationId = "eval_cascade_al";
    const base = "run_c4_base";
    const cand = "run_c4_cand";

    writeStatus(base, {
      status: "cancelled",
      role: "baseline",
      evaluationId,
    });
    writeStatus(cand, {
      status: "queued",
      role: "candidate",
      evaluationId,
    });
    fs.writeFileSync(path.join(jobsRoot, `${cand}.json`), "{}\n");

    const out = cancelRunWithCascade(base);
    expect(out).toMatchObject({
      ok: true,
      already: true,
      status: "cancelled",
      alsoCancelled: cand,
    });
  });

  it("omits alsoCancelled when sibling was already cancelled", async () => {
    const { cancelRunWithCascade } = await import("./cancelRun.js");
    const evaluationId = "eval_cascade_both";
    const base = "run_c5_base";
    const cand = "run_c5_cand";

    writeStatus(base, {
      status: "queued",
      role: "baseline",
      evaluationId,
    });
    fs.writeFileSync(path.join(jobsRoot, `${base}.json`), "{}\n");
    writeStatus(cand, {
      status: "cancelled",
      role: "candidate",
      evaluationId,
    });

    const out = cancelRunWithCascade(base);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.alsoCancelled).toBeUndefined();
      expect(out.status).toBe("cancelled");
    }
  });
});
