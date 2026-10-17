import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "@skillevalator/core";
import {
  cancelPairingMeta,
  findPairedCancelSiblingRunId,
} from "./cancelPairedSibling.js";

const tmpRoots: string[] = [];

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-cancel-pair-"));
  tmpRoots.push(root);
  return root;
}

describe("cancelPairingMeta", () => {
  it("keeps resolved evaluationId when status lacked it", () => {
    expect(
      cancelPairingMeta({
        role: "candidate",
        evaluationId: "eval_from_job",
      }),
    ).toEqual({ role: "candidate", evaluationId: "eval_from_job" });
  });

  it("omits empty evaluationId", () => {
    expect(cancelPairingMeta({ role: "baseline", evaluationId: null })).toEqual(
      { role: "baseline" },
    );
  });
});

describe("findPairedCancelSiblingRunId", () => {
  it("finds peer when evaluationId comes from job (not status)", () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, "run_base"));
    fs.mkdirSync(path.join(root, "run_cand"));
    writeJsonFile(path.join(root, "run_cand", "status.json"), {
      runId: "run_cand",
      status: "queued",
      role: "candidate",
      // intentionally no evaluationId — peer match must use resolver
    });

    expect(
      findPairedCancelSiblingRunId({
        runId: "run_base",
        evaluationId: "eval_1",
        role: "baseline",
        resultsRoot: root,
        loadMeta: () => null,
        resolvePeerEvaluationId: (peerRunId) =>
          peerRunId === "run_cand" ? "eval_1" : null,
      }),
    ).toBe("run_cand");
  });

  it("skips peer when resolved evaluationId does not match", () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, "run_base"));
    fs.mkdirSync(path.join(root, "run_other"));
    writeJsonFile(path.join(root, "run_other", "status.json"), {
      runId: "run_other",
      status: "queued",
      role: "candidate",
      evaluationId: "eval_other",
    });

    expect(
      findPairedCancelSiblingRunId({
        runId: "run_base",
        evaluationId: "eval_1",
        role: "baseline",
        resultsRoot: root,
        loadMeta: () => null,
        resolvePeerEvaluationId: (peerRunId) =>
          peerRunId === "run_other" ? "eval_other" : null,
      }),
    ).toBeNull();
  });

  it("prefers tip-healed meta legs over peer scan", () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, "run_base"));
    fs.mkdirSync(path.join(root, "run_cand"));

    expect(
      findPairedCancelSiblingRunId({
        runId: "run_base",
        evaluationId: "eval_1",
        role: "baseline",
        resultsRoot: root,
        loadMeta: () => ({
          baselineRunId: "run_base",
          candidateRunId: "run_cand",
        }),
        resolvePeerEvaluationId: () => null,
      }),
    ).toBe("run_cand");
  });
});
