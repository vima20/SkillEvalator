import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "./fsJson.js";
import { assertSafeId } from "./paths.js";
import type { RunResult } from "./schema.js";

/** Pre-produce job contract written to skill-snapshot/job.json by the worker. */
export type TrustedJobAttestation = {
  runId: string;
  evalSkillId: string;
  mode: string;
  modelId: string;
  repeats: number;
  role: "baseline" | "candidate";
  evaluationId?: string;
};

/**
 * Read skill-snapshot/job.json. Undefined when missing/unreadable/incomplete —
 * callers fail closed for official.
 */
export function resolveTrustedJobAttestationFromSnapshotDir(
  snapshotDir: string,
): TrustedJobAttestation | undefined {
  try {
    const jobPath = path.join(snapshotDir, "job.json");
    const st = fs.lstatSync(jobPath);
    if (st.isSymbolicLink() || !st.isFile()) return undefined;
    const raw = readJsonFile(jobPath) as Record<string, unknown>;
    const runId =
      typeof raw.runId === "string" ? raw.runId.trim() : "";
    const evalSkillId =
      typeof raw.evalSkillId === "string" ? raw.evalSkillId.trim() : "";
    const mode = typeof raw.mode === "string" ? raw.mode.trim() : "";
    const modelId =
      typeof raw.modelId === "string" ? raw.modelId.trim() : "";
    const repeats =
      typeof raw.repeats === "number" && Number.isFinite(raw.repeats)
        ? raw.repeats
        : NaN;
    const role = raw.role === "baseline" || raw.role === "candidate"
      ? raw.role
      : undefined;
    if (!runId || !evalSkillId || !mode || !modelId || !role) return undefined;
    if (!(repeats >= 1)) return undefined;
    const evaluationId =
      typeof raw.evaluationId === "string" && raw.evaluationId.trim()
        ? raw.evaluationId.trim()
        : undefined;
    return {
      runId,
      evalSkillId,
      mode,
      modelId,
      repeats,
      role,
      ...(evaluationId ? { evaluationId } : {}),
    };
  } catch {
    return undefined;
  }
}

export function resolveTrustedJobAttestationFromRunResultDir(
  resultsDirPath: string,
  runId: string,
): TrustedJobAttestation | undefined {
  try {
    const id = assertSafeId(runId, "runId");
    const snapRoot = path.join(resultsDirPath, id, "skill-snapshot");
    if (!fs.existsSync(snapRoot)) return undefined;
    return resolveTrustedJobAttestationFromSnapshotDir(snapRoot);
  } catch {
    return undefined;
  }
}

/** Build expected job pin from a scored leg (in-memory official tests). */
export function jobAttestationFromRunResult(
  leg: Pick<
    RunResult,
    | "runId"
    | "evalSkillId"
    | "mode"
    | "modelId"
    | "repeats"
    | "role"
    | "evaluationId"
  >,
): TrustedJobAttestation | undefined {
  if (leg.role !== "baseline" && leg.role !== "candidate") return undefined;
  const modelId = leg.modelId?.trim() ?? "";
  if (!modelId) return undefined;
  const evaluationId = leg.evaluationId?.trim();
  return {
    runId: leg.runId,
    evalSkillId: leg.evalSkillId,
    mode: leg.mode,
    modelId,
    repeats: leg.repeats,
    role: leg.role,
    ...(evaluationId ? { evaluationId } : {}),
  };
}

/** Fail-closed: result.json must match pre-produce skill-snapshot/job.json. */
export function collectOfficialJobAttestationIssues(
  label: "baseline" | "candidate",
  leg: RunResult,
  expected: TrustedJobAttestation | undefined,
): string[] {
  if (!expected) {
    return [
      `official Comparison requires trusted ${label} job.json (skill-snapshot)`,
    ];
  }
  const issues: string[] = [];
  if (leg.runId !== expected.runId) {
    issues.push(
      `${label}.runId ≠ skill-snapshot/job.json (${leg.runId} ≠ ${expected.runId})`,
    );
  }
  if (leg.evalSkillId !== expected.evalSkillId) {
    issues.push(
      `${label}.evalSkillId ≠ skill-snapshot/job.json (${leg.evalSkillId} ≠ ${expected.evalSkillId})`,
    );
  }
  if (leg.mode !== expected.mode) {
    issues.push(
      `${label}.mode ≠ skill-snapshot/job.json (${leg.mode} ≠ ${expected.mode})`,
    );
  }
  if (leg.modelId !== expected.modelId) {
    issues.push(
      `${label}.modelId ≠ skill-snapshot/job.json (${leg.modelId} ≠ ${expected.modelId})`,
    );
  }
  if (leg.repeats !== expected.repeats) {
    issues.push(
      `${label}.repeats ≠ skill-snapshot/job.json (${leg.repeats} ≠ ${expected.repeats})`,
    );
  }
  if (leg.role !== expected.role) {
    issues.push(
      `${label}.role ≠ skill-snapshot/job.json (${leg.role ?? "missing"} ≠ ${expected.role})`,
    );
  }
  if (expected.evaluationId) {
    const legEval = leg.evaluationId?.trim() ?? "";
    if (legEval !== expected.evaluationId) {
      issues.push(
        `${label}.evaluationId ≠ skill-snapshot/job.json (${legEval || "missing"} ≠ ${expected.evaluationId})`,
      );
    }
  }
  return issues;
}
