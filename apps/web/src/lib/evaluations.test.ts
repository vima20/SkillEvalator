import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  releaseWxLock,
  saveRetryMarker,
  tryAcquireWxLock,
  writeJsonFile,
} from "@skillevalator/core";

const temps: string[] = [];
let resultsRoot = "";

vi.mock("@/lib/paths", () => ({
  resultsDir: () => resultsRoot,
  jobsDir: () => path.join(resultsRoot, "..", "jobs"),
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-web-eval-"));
  temps.push(root);
  resultsRoot = path.join(root, "results");
  fs.mkdirSync(resultsRoot, { recursive: true });
});

function sampleResult(opts: {
  runId: string;
  role: "baseline" | "candidate";
  mode: "dry-run" | "official";
  evaluationId: string;
  score: number;
}) {
  return {
    runId: opts.runId,
    evalSkillId: "code-debugging-eval",
    evalSkillVersion: "abc",
    evalSkillGithubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    evaluationId: opts.evaluationId,
    taskSetId: "cde-v1",
    taskIds: ["bug-01"],
    pipeline: { produce: "model", grade: "docker_script" },
    modelId: "gpt-4o-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: 1,
    aggregate: "mean",
    perTask: [],
    score: opts.score,
    subscores: {},
    rationale: "",
    findings: [],
    costUsd: 0.01,
    latencyMs: 1000,
    status: "ok",
    startedAt: "2026-10-12T00:00:00.000Z",
    finishedAt: "2026-10-12T00:01:00.000Z",
    mode: opts.mode,
    role: opts.role,
    capture: {
      githubUrl:
        "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
      commit: "deadbeef",
      license: "MIT",
      dependencies: [],
      skillVersion: "abc",
      role: opts.role,
      promptHash: opts.role === "baseline" ? "basehash00000001" : "candhash00000002",
      promptKind: opts.role === "baseline" ? "baseline_neutral" : "skill_md",
    },
  };
}

describe("resolveTipCandidateRunId", () => {
  it("prefers Comparison tip, then healed meta", async () => {
    const { resolveTipCandidateRunId, resolveTipBaselineRunId } = await import(
      "./evaluations.js"
    );
    expect(
      resolveTipCandidateRunId({
        comparison: { candidateRunId: "run_cmp" },
        meta: { candidateRunId: "run_meta" },
      }),
    ).toBe("run_cmp");
    expect(
      resolveTipCandidateRunId({
        comparison: null,
        meta: { candidateRunId: "run_meta" },
      }),
    ).toBe("run_meta");
    expect(resolveTipCandidateRunId({ comparison: null, meta: null })).toBe(
      null,
    );
    expect(
      resolveTipBaselineRunId({
        comparison: null,
        meta: { baselineRunId: "run_base_meta" },
      }),
    ).toBe("run_base_meta");
  });
});

describe("loadEvaluationComparison meta mode", () => {
  it("INCONCLUSIVE when evaluation.json mode is garbage even if legs agree", async () => {
    const evaluationId = "eval_100_badmode";
    const baselineRunId = "run_100_base_bm";
    const candidateRunId = "run_100_cand_bm";

    writeJsonFile(path.join(resultsRoot, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      mode: "prod",
      baselineRunId,
      candidateRunId,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    writeJsonFile(
      path.join(resultsRoot, baselineRunId, "result.json"),
      sampleResult({
        runId: baselineRunId,
        role: "baseline",
        mode: "dry-run",
        evaluationId,
        score: 0.5,
      }),
    );
    writeJsonFile(
      path.join(resultsRoot, candidateRunId, "result.json"),
      sampleResult({
        runId: candidateRunId,
        role: "candidate",
        mode: "dry-run",
        evaluationId,
        score: 0.95,
      }),
    );

    const { loadEvaluationComparison } = await import("./evaluations.js");
    const out = loadEvaluationComparison(evaluationId);
    expect(out.comparison?.verdict).toBe("INCONCLUSIVE");
    expect(
      out.comparison?.parity.issues.some((i) => i.includes("invalid")),
    ).toBe(true);
  });
});

describe("updateEvaluationMetaLeg", () => {
  it("syncs mode so comparison meta parity matches retried legs", async () => {
    const evaluationId = "eval_100_modesync";
    const baselineRunId = "run_100_base_dry";
    const candidateRunId = "run_100_cand_dry";

    writeJsonFile(path.join(resultsRoot, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      // Stale meta mode — legs are dry-run (retry re-linked without mode sync).
      mode: "official",
      baselineRunId,
      candidateRunId,
      createdAt: "2026-10-12T00:00:00.000Z",
    });

    writeJsonFile(
      path.join(resultsRoot, baselineRunId, "result.json"),
      sampleResult({
        runId: baselineRunId,
        role: "baseline",
        mode: "dry-run",
        evaluationId,
        score: 0.5,
      }),
    );
    writeJsonFile(
      path.join(resultsRoot, candidateRunId, "result.json"),
      sampleResult({
        runId: candidateRunId,
        role: "candidate",
        mode: "dry-run",
        evaluationId,
        score: 0.95,
      }),
    );

    const { updateEvaluationMetaLeg, loadEvaluationComparison } = await import(
      "./evaluations.js"
    );

    const before = loadEvaluationComparison(evaluationId);
    expect(before.comparison).not.toBeNull();
    expect(before.comparison?.verdict).toBe("INCONCLUSIVE");
    expect(
      before.comparison?.parity.issues.some((i) =>
        i.includes("evaluation meta mode"),
      ),
    ).toBe(true);

    expect(
      updateEvaluationMetaLeg({
        evaluationId,
        role: "candidate",
        runId: candidateRunId,
        mode: "dry-run",
        evalSkillId: "code-debugging-eval",
      }),
    ).toBe(true);

    const meta = JSON.parse(
      fs.readFileSync(
        path.join(resultsRoot, evaluationId, "evaluation.json"),
        "utf8",
      ),
    ) as { mode: string; candidateRunId: string };
    expect(meta.mode).toBe("dry-run");
    expect(meta.candidateRunId).toBe(candidateRunId);

    const after = loadEvaluationComparison(evaluationId);
    expect(
      after.comparison?.parity.issues.some((i) =>
        i.includes("evaluation meta mode"),
      ),
    ).toBe(false);
    // Dry-run never emits adoption PASS even when lift clears delta.
    expect(after.comparison?.verdict).toBe("INCONCLUSIVE");
    expect(after.comparison?.lift).toBeGreaterThan(0);
  });

  it("unlinks superseded benefit cache when tip-heal lock fails", async () => {
    const evaluationId = "eval_100_heal_unlock";
    const oldCand = "run_100_old_heal";
    const newCand = "run_100_new_heal";
    const baselineRunId = "run_100_base_heal";

    const { loadEvaluationComparison, evaluationMetaPath } =
      await import("./evaluations.js");

    writeJsonFile(path.join(resultsRoot, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      mode: "dry-run",
      baselineRunId,
      candidateRunId: oldCand,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    writeJsonFile(path.join(resultsRoot, oldCand, "benefit-report.json"), {
      verdict: { recommendation: "use" },
      stale: true,
    });
    writeJsonFile(path.join(resultsRoot, oldCand, "status.json"), {
      runId: oldCand,
      status: "failed",
      role: "candidate",
      evaluationId,
    });
    writeJsonFile(path.join(resultsRoot, newCand, "status.json"), {
      runId: newCand,
      status: "ok",
      role: "candidate",
      evaluationId,
    });
    writeJsonFile(
      path.join(resultsRoot, baselineRunId, "result.json"),
      sampleResult({
        runId: baselineRunId,
        role: "baseline",
        mode: "dry-run",
        evaluationId,
        score: 0.5,
      }),
    );
    writeJsonFile(
      path.join(resultsRoot, newCand, "result.json"),
      sampleResult({
        runId: newCand,
        role: "candidate",
        mode: "dry-run",
        evaluationId,
        score: 0.9,
      }),
    );
    saveRetryMarker(resultsRoot, oldCand, newCand);

    // Hold meta lock so disk heal fails; in-memory tip still unlinks Benefit.
    const lockPath = `${evaluationMetaPath(evaluationId)}.lock`;
    expect(tryAcquireWxLock(lockPath, { staleMs: 60_000, retries: 1 })).toBe(
      true,
    );
    try {
      const out = loadEvaluationComparison(evaluationId);
      expect(out.meta?.candidateRunId).toBe(newCand);
      expect(
        fs.existsSync(path.join(resultsRoot, oldCand, "benefit-report.json")),
      ).toBe(false);
    } finally {
      releaseWxLock(lockPath);
    }
  });

  it("deletes superseded tip benefit-report.json on meta leg update", async () => {
    const evaluationId = "eval_100_benunlink";
    const oldCand = "run_100_old_bunl";
    const newCand = "run_100_new_bunl";
    const baselineRunId = "run_100_base_bunl";

    writeJsonFile(path.join(resultsRoot, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      mode: "official",
      baselineRunId,
      candidateRunId: oldCand,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    writeJsonFile(path.join(resultsRoot, oldCand, "benefit-report.json"), {
      verdict: { recommendation: "use" },
      stale: true,
    });

    const { updateEvaluationMetaLeg } = await import("./evaluations.js");
    expect(
      updateEvaluationMetaLeg({
        evaluationId,
        role: "candidate",
        runId: newCand,
        mode: "official",
        evalSkillId: "code-debugging-eval",
      }),
    ).toBe(true);

    expect(
      fs.existsSync(path.join(resultsRoot, oldCand, "benefit-report.json")),
    ).toBe(false);
    const meta = JSON.parse(
      fs.readFileSync(
        path.join(resultsRoot, evaluationId, "evaluation.json"),
        "utf8",
      ),
    ) as { candidateRunId: string };
    expect(meta.candidateRunId).toBe(newCand);
  });
});

describe("resolveHealedMetaLegsForCancel ghost tip", () => {
  function plantGhostCandidateTip(opts: {
    evaluationId: string;
    baselineRunId: string;
    parentCand: string;
    ghostCand: string;
  }) {
    writeJsonFile(
      path.join(resultsRoot, opts.evaluationId, "evaluation.json"),
      {
        evaluationId: opts.evaluationId,
        evalSkillId: "code-debugging-eval",
        mode: "official",
        baselineRunId: opts.baselineRunId,
        candidateRunId: opts.ghostCand,
        createdAt: "2026-10-12T00:00:00.000Z",
      },
    );
    writeJsonFile(path.join(resultsRoot, opts.baselineRunId, "status.json"), {
      runId: opts.baselineRunId,
      status: "ok",
      role: "baseline",
      evaluationId: opts.evaluationId,
    });
    writeJsonFile(path.join(resultsRoot, opts.parentCand, "status.json"), {
      runId: opts.parentCand,
      status: "failed",
      role: "candidate",
      evaluationId: opts.evaluationId,
    });
    // Ghost tip: no status/result; parent still has retry-of → ghost.
    saveRetryMarker(resultsRoot, opts.parentCand, opts.ghostCand);
  }

  it("rolls candidate tip back to parent when tip has no status/result/job", async () => {
    const evaluationId = "eval_100_ghosttip";
    const baselineRunId = "run_100_base_ghst";
    const parentCand = "run_100_parentgh";
    const ghostCand = "run_100_ghostxxx";
    plantGhostCandidateTip({
      evaluationId,
      baselineRunId,
      parentCand,
      ghostCand,
    });

    const { resolveHealedMetaLegsForCancel } = await import("./evaluations.js");
    const healed = resolveHealedMetaLegsForCancel(evaluationId);
    expect(healed).toEqual({
      baselineRunId,
      candidateRunId: parentCand,
    });
    const meta = JSON.parse(
      fs.readFileSync(
        path.join(resultsRoot, evaluationId, "evaluation.json"),
        "utf8",
      ),
    ) as { candidateRunId: string };
    expect(meta.candidateRunId).toBe(parentCand);
    expect(
      fs.existsSync(path.join(resultsRoot, parentCand, "retry-of.json")),
    ).toBe(false);
  });

  it("exposes parent in memory while lock busy without mutating disk tip", async () => {
    const evaluationId = "eval_100_ghostlock";
    const baselineRunId = "run_100_base_glck";
    const parentCand = "run_100_parentlk";
    const ghostCand = "run_100_ghostlkx";
    plantGhostCandidateTip({
      evaluationId,
      baselineRunId,
      parentCand,
      ghostCand,
    });
    fs.writeFileSync(
      path.join(resultsRoot, parentCand, "retry-enqueue.lock"),
      String(Date.now()),
      "utf8",
    );

    const { resolveHealedMetaLegsForCancel } = await import("./evaluations.js");
    const healed = resolveHealedMetaLegsForCancel(evaluationId);
    expect(healed).toEqual({
      baselineRunId,
      candidateRunId: parentCand,
    });
    const meta = JSON.parse(
      fs.readFileSync(
        path.join(resultsRoot, evaluationId, "evaluation.json"),
        "utf8",
      ),
    ) as { candidateRunId: string };
    // Disk tip stays on ghost until lock releases; marker kept for heal.
    expect(meta.candidateRunId).toBe(ghostCand);
    expect(
      fs.existsSync(path.join(resultsRoot, parentCand, "retry-of.json")),
    ).toBe(true);
  });
});
