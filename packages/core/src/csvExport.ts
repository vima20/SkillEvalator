import type { RunComparison } from "./comparison.js";
import type { RunResult } from "./schema.js";

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map(csvEscape).join(",");
}

/** Per-task CSV for one run (Unikie raw-data export). */
export function runResultToCsv(result: RunResult): string {
  const header = row([
    "runId",
    "evaluationId",
    "role",
    "mode",
    "modelId",
    "evalSkillId",
    "taskSetId",
    "taskId",
    "taskStatus",
    "taskScore",
    "diffRatio",
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "runScore",
    "runStatus",
    "costUsd",
    "latencyMs",
    "runPromptTokens",
    "runCompletionTokens",
    "runTotalTokens",
    "commit",
    "license",
  ]);

  const lines = [header];
  const tasks =
    result.perTask.length > 0
      ? result.perTask
      : [
          {
            taskId: "",
            score: null,
            status: result.status,
            scriptResults: [],
          },
        ];

  for (const t of tasks) {
    lines.push(
      row([
        result.runId,
        result.evaluationId ?? "",
        result.role ?? "candidate",
        result.mode,
        result.modelId,
        result.evalSkillId,
        result.taskSetId,
        t.taskId,
        t.status,
        t.score,
        t.diffRatio ?? "",
        t.tokens?.promptTokens ?? "",
        t.tokens?.completionTokens ?? "",
        t.tokens?.totalTokens ?? "",
        result.score,
        result.status,
        result.costUsd,
        result.latencyMs,
        result.tokens?.promptTokens ?? "",
        result.tokens?.completionTokens ?? "",
        result.tokens?.totalTokens ?? "",
        result.capture?.commit ?? "",
        result.capture?.license ?? "",
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Task-level regression CSV for a paired comparison. */
export function comparisonToCsv(comparison: RunComparison): string {
  const header = row([
    "evaluationId",
    "taskId",
    "baselineScore",
    "candidateScore",
    "delta",
    "regression",
    "improvement",
    "baselineStatus",
    "candidateStatus",
    "verdict",
    "lift",
    "parityOk",
  ]);
  const lines = [header];
  for (const t of comparison.perTask ?? []) {
    lines.push(
      row([
        comparison.evaluationId,
        t.taskId,
        t.baselineScore,
        t.candidateScore,
        t.delta,
        t.regression,
        t.improvement,
        t.baselineStatus,
        t.candidateStatus,
        comparison.verdict,
        comparison.lift,
        comparison.parity.ok,
      ]),
    );
  }
  if ((comparison.perTask ?? []).length === 0) {
    lines.push(
      row([
        comparison.evaluationId,
        "",
        comparison.baselineScore,
        comparison.candidateScore,
        comparison.lift,
        false,
        false,
        comparison.baselineStatus,
        comparison.candidateStatus,
        comparison.verdict,
        comparison.lift,
        comparison.parity.ok,
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}
