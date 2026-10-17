import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findRepoRoot, writeJsonFile } from "@skillevalator/core";

const temps: string[] = [];
let jobsRoot = "";
let resultsRoot = "";
/** When set, skillsDirs() returns only this root (empty-SKILL.md tests). */
let skillsDirsOverride: string[] | null = null;

vi.mock("@/lib/paths", () => ({
  jobsDir: () => jobsRoot,
  resultsDir: () => resultsRoot,
  skillsDirs: () => {
    if (skillsDirsOverride) return skillsDirsOverride;
    const repo = findRepoRoot(path.resolve(process.cwd()));
    return [path.join(repo, "eval-skills")];
  },
  skillsDir: () => {
    if (skillsDirsOverride?.[0]) return skillsDirsOverride[0];
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
  skillsDirsOverride = null;
  vi.resetModules();
});

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-web-enq-"));
  temps.push(root);
  jobsRoot = path.join(root, "jobs");
  resultsRoot = path.join(root, "results");
  skillsDirsOverride = null;
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

  it("on lock busy writes .cancel but does not unlink or stamp failed", async () => {
    const { abortQueuedRun } = await import("./enqueueRun.js");
    const runId = "run_100_lockbusy";
    writeJsonFile(path.join(resultsRoot, runId, "status.json"), {
      runId,
      status: "queued",
      role: "baseline",
      evaluationId: "eval_100_busy",
    });
    fs.writeFileSync(path.join(jobsRoot, `${runId}.json`), "{}");
    // Fresh lock — abort retries then falls back to cancel-only (no unlink).
    fs.writeFileSync(path.join(jobsRoot, ".enqueue.lock"), String(Date.now()));

    abortQueuedRun(runId, "meta link failed", { role: "baseline" });

    expect(fs.existsSync(path.join(jobsRoot, `${runId}.cancel`))).toBe(true);
    expect(fs.existsSync(path.join(jobsRoot, `${runId}.json`))).toBe(true);
    const st = JSON.parse(
      fs.readFileSync(path.join(resultsRoot, runId, "status.json"), "utf8"),
    ) as { status: string };
    expect(st.status).toBe("queued");
  }, 15_000);
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
    expect(out.errorCode).toBe("enqueue_queue_full");

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
    expect(out.errorCode).toBe("enqueue_queue_full");
    expect(fs.existsSync(path.join(jobsRoot, ".enqueue.lock"))).toBe(false);
  });

  it("rejects empty SKILL.md before queueing (no status/job files)", async () => {
    const skillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "se-web-empty-"));
    temps.push(skillsRoot);
    const id = "empty-skill-eval";
    const skillRoot = path.join(skillsRoot, id);
    writeJsonFile(path.join(skillRoot, "fixtures", "manifest.json"), {
      taskSetId: "t-v1",
      githubUrl: "https://github.com/acme/skills",
      license: "MIT",
      dependencies: [],
      taskIds: ["bug-01"],
      dryRunIds: ["bug-01"],
      targetFile: { "bug-01": "fix.js" },
    });
    fs.mkdirSync(path.join(skillRoot, "fixtures", "bug-01"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(skillRoot, "SKILL.md"), "   \n", "utf8");
    skillsDirsOverride = [skillsRoot];

    const { enqueueRun, enqueueEvaluationPair } = await import(
      "./enqueueRun.js"
    );
    const single = enqueueRun({ evalSkillId: id, mode: "dry-run", repeats: 1 });
    expect(single.ok).toBe(false);
    if (single.ok) return;
    expect(single.status).toBe(400);
    expect(single.errorCode).toBe("enqueue_skill_not_ready");
    expect(single.error).toMatch(/SKILL\.md empty/i);

    const pair = enqueueEvaluationPair({
      evalSkillId: id,
      mode: "dry-run",
      repeats: 1,
    });
    expect(pair.ok).toBe(false);
    if (pair.ok) return;
    expect(pair.status).toBe(400);
    expect(pair.errorCode).toBe("enqueue_skill_not_ready");
    expect(pair.error).toMatch(/SKILL\.md empty/i);

    expect(fs.readdirSync(jobsRoot).filter((n) => n.endsWith(".json"))).toEqual(
      [],
    );
    expect(fs.readdirSync(resultsRoot)).toEqual([]);
  });
});
