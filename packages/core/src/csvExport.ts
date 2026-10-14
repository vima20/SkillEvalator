import type { BenefitReport } from "./benefitReport.js";
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
  const parityIssues = comparison.parity.issues.join("; ");
  const header = row([
    "evaluationId",
    "evalSkillId",
    "taskSetId",
    "mode",
    "modelId",
    "baselineRunId",
    "candidateRunId",
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
    "parityIssues",
    "commit",
    "license",
  ]);
  const lines = [header];
  const common = [
    comparison.evaluationId,
    comparison.evalSkillId,
    comparison.taskSetId,
    comparison.mode,
    comparison.modelId,
    comparison.baselineRunId,
    comparison.candidateRunId,
  ] as const;
  const captureCells = [
    comparison.capture?.commit ?? "",
    comparison.capture?.license ?? "",
  ] as const;

  for (const t of comparison.perTask ?? []) {
    lines.push(
      row([
        ...common,
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
        parityIssues,
        ...captureCells,
      ]),
    );
  }
  if ((comparison.perTask ?? []).length === 0) {
    lines.push(
      row([
        ...common,
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
        parityIssues,
        ...captureCells,
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Benefit Report scorecard as CSV (narrative remains Markdown). */
export function benefitReportToCsv(
  report: BenefitReport,
  comparison?: {
    comparisonVerdict?: string;
    comparisonMode?: string;
    comparisonLift?: number | null;
  },
): string {
  const header = row([
    "runId",
    "evaluationId",
    "role",
    "mode",
    "modelId",
    "evalSkillId",
    "taskSetId",
    "recommendation",
    "headline",
    "stars",
    "grade",
    "comparisonVerdict",
    "comparisonMode",
    "comparisonLift",
    "runScore",
    "scoreSpread",
    "tasksPassed",
    "tasksTotal",
    "taskId",
    "taskScore",
    "taskStatus",
    "taskLabel",
    "costUsd",
    "latencyMs",
    "status",
    "commit",
    "license",
  ]);
  const lines = [header];
  const tasks =
    report.scorecard.perTask.length > 0
      ? report.scorecard.perTask
      : [
          {
            taskId: "",
            score: report.scorecard.score,
            status: report.cost.status,
            label: report.scorecard.label,
          },
        ];
  for (const t of tasks) {
    lines.push(
      row([
        report.config.runId,
        report.config.evaluationId ?? "",
        report.config.role ?? "candidate",
        report.config.mode,
        report.config.modelId,
        report.config.evalSkillId,
        report.config.taskSetId,
        report.verdict.recommendation,
        report.verdict.headline,
        report.rating.stars,
        report.rating.grade,
        comparison?.comparisonVerdict ?? "",
        comparison?.comparisonMode ?? "",
        comparison?.comparisonLift ?? "",
        report.scorecard.score,
        report.scorecard.scoreSpread,
        report.scorecard.tasksPassed,
        report.scorecard.tasksTotal,
        t.taskId,
        t.score,
        t.status,
        t.label,
        report.cost.costUsd,
        report.cost.latencyMs,
        report.cost.status,
        report.config.commit ?? "",
        report.config.license ?? "",
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}
