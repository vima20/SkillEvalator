import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findRepoRoot, writeJsonFile } from "@skillevalator/core";

const temps: string[] = [];
let jobsRoot = "";
let resultsRoot = "";

vi.mock("@/lib/paths", () => ({
  jobsDir: () => jobsRoot,
  resultsDir: () => resultsRoot,
  skillsDirs: () => {
    const repo = findRepoRoot(path.resolve(process.cwd()));
    return [path.join(repo, "eval-skills")];
  },
  skillsDir: () => {
    const repo = findRepoRoot(path.resolve(process.cwd()));
    return path.join(repo, "eval-skills");
  },
  importedSkillsDir: () => path.join(resultsRoot, "imported"),
  repoRoot: () => findRepoRoot(path.resolve(process.cwd())),
}));

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  vi.resetModules();
});

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-web-enq-"));
  temps.push(root);
  jobsRoot = path.join(root, "jobs");
  resultsRoot = path.join(root, "results");
  fs.mkdirSync(jobsRoot, { recursive: true });
  fs.mkdirSync(resultsRoot, { recursive: true });
});

describe("abortQueuedRun", () => {
  it("does not stamp failed when worker already claimed .running.json", async () => {
    const { abortQueuedRun } = await import("./enqueueRun.js");
    const runId = "run_100_claimedxx";

    writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
      runId,
      status: "running",
      evaluationId: "eval_100_pairxx",
      role: "baseline",
    });
    fs.writeFileSync(path.join(jobsRoot, `${runId}.running.json`), "{}");

    abortQueuedRun(runId, "test abort", { role: "baseline" });

    expect(fs.existsSync(path.join(jobsRoot, `${runId}.cancel`))).toBe(true);
    const st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; evaluationId?: string };
    expect(st.status).toBe("running");
    expect(st.evaluationId).toBe("eval_100_pairxx");
  });

  it("stamps failed and drops evaluationId when still queued", async () => {
    const { abortQueuedRun } = await import("./enqueueRun.js");
    const runId = "run_100_queuedxx";

    writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
      runId,
      status: "queued",
      evaluationId: "eval_100_pairyy",
      role: "baseline",
    });
    fs.writeFileSync(path.join(jobsRoot, `${runId}.json`), "{}");

    abortQueuedRun(runId, "candidate failed", { role: "baseline" });

    expect(fs.existsSync(path.join(jobsRoot, `${runId}.json`))).toBe(false);
    expect(fs.existsSync(path.join(jobsRoot, `${runId}.cancel`))).toBe(true);
    const st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; evaluationId?: string; errorCode?: string };
    expect(st.status).toBe("failed");
    expect(st.errorCode).toBe("paired_enqueue_aborted");
    expect(st.evaluationId).toBeUndefined();
  });

  it("keeps evaluationId on retry abort when meta passes it", async () => {
    const { abortQueuedRun } = await import("./enqueueRun.js");
    const runId = "run_100_retrykeep";

    writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
      runId,
      status: "queued",
      role: "candidate",
    });

    abortQueuedRun(runId, "meta link failed", {
      role: "candidate",
      evaluationId: "eval_100_keepmeta",
    });

    const st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string; evaluationId?: string };
    expect(st.status).toBe("failed");
    expect(st.evaluationId).toBe("eval_100_keepmeta");
  });
});

describe("enqueueEvaluationPair", () => {
  it("writes evaluation.json and queues baseline + candidate", async () => {
    const { enqueueEvaluationPair } = await import("./enqueueRun.js");
    const out = enqueueEvaluationPair({
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      repeats: 1,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const metaPath = path.join(
      resultsRoot,
      out.evaluationId,
      "evaluation.json",
    );
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
      baselineRunId: string;
      candidateRunId: string;
    };
    expect(meta.baselineRunId).toBe(out.baselineRunId);
    expect(meta.candidateRunId).toBe(out.candidateRunId);
    expect(fs.existsSync(path.join(jobsRoot, `${out.baselineRunId}.json`))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(jobsRoot, `${out.candidateRunId}.json`)),
    ).toBe(true);
    // Enqueue lock must not leak after a successful pair.
    expect(fs.existsSync(path.join(jobsRoot, ".enqueue.lock"))).toBe(false);
  });

  it("rejects pair when fewer than two queue slots remain", async () => {
    const { enqueueEvaluationPair, enqueueRun } = await import(
      "./enqueueRun.js"
    );
    // Fill to max-1 so a pair (needs 2) cannot fit.
    for (let i = 0; i < 19; i++) {
      const filler = path.join(jobsRoot, `run_fill_${i}.json`);
      fs.writeFileSync(filler, "{}");
    }
    const out = enqueueEvaluationPair({
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      repeats: 1,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(429);

    // Single enqueue still fits in the last slot.
    const single = enqueueRun({
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      repeats: 1,
    });
    expect(single.ok).toBe(true);
  });
});

describe("enqueueRun", () => {
  it("rejects when queue is full and releases lock", async () => {
    const { enqueueRun } = await import("./enqueueRun.js");
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(jobsRoot, `run_full_${i}.json`), "{}");
    }
    const out = enqueueRun({
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      repeats: 1,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(429);
    expect(fs.existsSync(path.join(jobsRoot, ".enqueue.lock"))).toBe(false);
  });
});
