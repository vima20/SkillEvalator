import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertSafeId,
  type RunComparison,
  writeJsonFile,
} from "@skillevalator/core";
import {
  officialComparisonExportGate,
  type OfficialComparisonEvidence,
  type OfficialComparisonExportDeny,
} from "@/lib/comparisonExport";
import type { EvaluationMeta } from "@/lib/evaluations";

export type PilotArchiveBuildInfo = {
  gitSha: string | null;
  gitShaShort: string | null;
  dirty: boolean;
};

/**
 * Live official pilot archive — same evidence bar as Comparison CSV.
 */
export function pilotArchiveGate(opts: {
  comparison: Pick<RunComparison, "verdict" | "mode">;
} & OfficialComparisonEvidence):
  | { ok: true }
  | OfficialComparisonExportDeny {
  return officialComparisonExportGate(
    opts.comparison,
    {
      metaSmoke: opts.metaSmoke,
      baselineFakeProduce: opts.baselineFakeProduce,
      candidateFakeProduce: opts.candidateFakeProduce,
      baselineProduceAttested: opts.baselineProduceAttested,
      candidateProduceAttested: opts.candidateProduceAttested,
    },
    "pilot archive download",
  );
}

const RUN_FILE_ALLOWLIST = [
  "status.json",
  "result.json",
  "benefit-report.json",
  "benefit-report.md",
] as const;

function copyIfExists(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copySkillSnapshot(runDir: string, destDir: string): void {
  const snap = path.join(runDir, "skill-snapshot");
  if (!fs.existsSync(snap) || !fs.statSync(snap).isDirectory()) return;
  const walk = (from: string, to: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      const src = path.join(from, name);
      const dst = path.join(to, name);
      const st = fs.lstatSync(src);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(src, dst);
      else if (st.isFile()) fs.copyFileSync(src, dst);
    }
  };
  walk(snap, path.join(destDir, "skill-snapshot"));
}

function stageRunDir(
  resultsDir: string,
  runId: string,
  destRoot: string,
  label: "baseline" | "candidate",
): void {
  const id = assertSafeId(runId, "runId");
  const srcDir = path.join(resultsDir, id);
  const destDir = path.join(destRoot, label);
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of RUN_FILE_ALLOWLIST) {
    copyIfExists(path.join(srcDir, name), path.join(destDir, name));
  }
  copySkillSnapshot(srcDir, destDir);
}

/**
 * Build a zip Buffer of tip legs + evaluation meta + comparison + MANIFEST.
 * Uses system `tar -a` (same family as skill import unzip).
 */
export function buildPilotArchiveZip(opts: {
  resultsDir: string;
  evaluationId: string;
  baselineRunId: string;
  candidateRunId: string;
  comparison: RunComparison;
  meta: EvaluationMeta;
  build: PilotArchiveBuildInfo;
  createdAt?: string;
}): Buffer {
  const evaluationId = assertSafeId(opts.evaluationId, "evaluationId");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "se-pilot-archive-"));
  const staging = path.join(tmp, "staging");
  const zipPath = path.join(tmp, `${evaluationId}-pilot.zip`);
  try {
    fs.mkdirSync(staging, { recursive: true });

    const evalDest = path.join(staging, "evaluation");
    fs.mkdirSync(evalDest, { recursive: true });
    copyIfExists(
      path.join(opts.resultsDir, evaluationId, "evaluation.json"),
      path.join(evalDest, "evaluation.json"),
    );
    writeJsonFile(path.join(evalDest, "comparison.json"), opts.comparison);

    stageRunDir(opts.resultsDir, opts.baselineRunId, staging, "baseline");
    stageRunDir(opts.resultsDir, opts.candidateRunId, staging, "candidate");

    const manifest = {
      kind: "skillevalator-pilot-archive",
      version: 1,
      createdAt: opts.createdAt ?? new Date().toISOString(),
      evaluationId,
      evalSkillId: opts.comparison.evalSkillId,
      taskSetId: opts.comparison.taskSetId,
      mode: opts.comparison.mode,
      verdict: opts.comparison.verdict,
      lift: opts.comparison.lift,
      modelId: opts.comparison.modelId,
      baselineRunId: opts.baselineRunId,
      candidateRunId: opts.candidateRunId,
      build: opts.build,
      notes:
        "Live official tip legs only. Not Cursor/KH adoption proof — produce→grade on locked task set.",
    };
    writeJsonFile(path.join(staging, "MANIFEST.json"), manifest);

    const r = spawnSync(
      "tar",
      ["-a", "-cf", zipPath, "-C", staging, "."],
      {
        encoding: "utf8",
        timeout: 60_000,
        windowsHide: true,
      },
    );
    if (r.error) {
      throw new Error(`pilot archive zip failed: ${r.error.message}`);
    }
    if (r.status !== 0) {
      throw new Error(
        `pilot archive zip failed: ${(r.stderr || r.stdout || `exit ${r.status}`).trim()}`,
      );
    }
    if (!fs.existsSync(zipPath)) {
      throw new Error("pilot archive zip missing after tar");
    }
    return fs.readFileSync(zipPath);
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
