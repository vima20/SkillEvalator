import type { RunResult } from "./schema.js";
import { labelForScore, type ScoreLabel } from "./scoring.js";

/** Harness recommendation: should Unikie use this skill (for this model/mode)? */
export type SkillUseVerdict = "use" | "do_not_use" | "inconclusive";

export type BenefitVerdict = {
  recommendation: SkillUseVerdict;
  /** Short Finnish headline for UI. */
  headline: string;
  /** One-line English decision for Markdown/export. */
  decision: string;
  rationale: string;
};

export type BenefitReport = {
  title: string;
  generatedAt: string;
  /** Explicit: harness score ≠ KH-adoption proof. */
  disclaimer: string;
  decisionQuestion: string;
  verdict: BenefitVerdict;
  config: {
    runId: string;
    mode: RunResult["mode"];
    modelId: string;
    evalSkillId: string;
    evalSkillVersion: string;
    evalSkillGithubUrl?: string;
    taskSetId: string;
    taskIds: string[];
    repeats: number;
    aggregate: string;
    decoding: RunResult["decoding"];
    pipeline: RunResult["pipeline"];
  };
  scorecard: {
    label: ScoreLabel;
    score: number | null;
    scoreSpread: number;
    tasksPassed: number;
    tasksTotal: number;
    perTask: Array<{
      taskId: string;
      score: number | null;
      status: string;
      label: ScoreLabel;
    }>;
  };
  harnessChecks: {
    knownGoodSupported: boolean;
    knownBadSupported: boolean;
    note: string;
  };
  constraints: string[];
  cost: {
    costUsd: number;
    latencyMs: number;
    status: RunResult["status"];
    findings: string[];
  };
};

const DISCLAIMER =
  "This Benefit Report measures model produce → Docker/host grade on a fixed task set. " +
  "It is not proof of Cursor/KH skill adoption, production readiness, or multi-model superiority.";

const DECISION_QUESTION =
  "Kannattaako tätä eval-skilliä käyttää Unikien engineering-työssä tällä mallilla?";

/**
 * Official + perfect score → use.
 * Completed run with imperfect score → do not use.
 * Dry-run / cancelled / budget / null score → inconclusive.
 */
export function decideSkillUse(result: RunResult): BenefitVerdict {
  const score = result.score;
  const status = result.status;

  if (status === "cancelled" || status === "budget_stop") {
    return {
      recommendation: "inconclusive",
      headline: "EI VOIDA TUOMITA — ajo keskeytyi",
      decision: "INCONCLUSIVE — do not adopt based on this run",
      rationale:
        status === "cancelled"
          ? "Run was cancelled before a complete scorecard was produced."
          : "Cost hard-stop ended the run; score is not a valid adoption signal.",
    };
  }

  if (status === "failed" || score === null) {
    return {
      recommendation: "do_not_use",
      headline: "ÄLÄ KÄYTÄ — ei kelvollista läpäisyä",
      decision: "DO NOT USE — no valid passing scorecard",
      rationale:
        "Run did not produce a usable passing score. Do not rely on this skill/model pairing until a clean official pass exists.",
    };
  }

  if (result.mode === "dry-run") {
    if (score < 1) {
      return {
        recommendation: "do_not_use",
        headline: "ÄLÄ KÄYTÄ — dry-run ei läpäissyt",
        decision: "DO NOT USE — dry-run failed the task set",
        rationale: `Dry-run score ${score.toFixed(2)} < 1. Fix the skill/model pairing before investing in an official run.`,
      };
    }
    return {
      recommendation: "inconclusive",
      headline: "EI VOIDA TUOMITA — aja official",
      decision: "INCONCLUSIVE — dry-run passed; official run required",
      rationale:
        "Dry-run passed on a task subset with the cheaper model. That is encouraging but not enough to recommend production use. Run mode=official (≥3 repeats) before adopting the skill.",
    };
  }

  // official
  if (score < 1) {
    return {
      recommendation: "do_not_use",
      headline: "ÄLÄ KÄYTÄ — official ei läpäissyt",
      decision: "DO NOT USE — official evaluation failed",
      rationale: `Official score ${score.toFixed(2)} < 1 on task set ${result.taskSetId}. Do not use this skill with ${result.modelId} until it reaches a full pass.`,
    };
  }

  return {
    recommendation: "use",
    headline: "KÄYTÄ — official läpäisi",
    decision: "USE — official evaluation passed",
    rationale: `Official run scored ${score.toFixed(2)} (${labelForScore(score, result.scoreSpread ?? 0)}) on ${result.taskSetId} with ${result.modelId}. Harness supports using this skill for this pairing. Still not KH-adoption proof.`,
  };
}

export function buildBenefitReport(result: RunResult): BenefitReport {
  const spread = result.scoreSpread ?? 0;
  const label = labelForScore(result.score, spread);
  const perTask = result.perTask.map((t) => ({
    taskId: t.taskId,
    score: t.score,
    status: t.status,
    label: labelForScore(t.score),
  }));
  const verdict = decideSkillUse(result);

  return {
    title: `Benefit Report · ${result.evalSkillId} · ${result.runId}`,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    decisionQuestion: DECISION_QUESTION,
    verdict,
    config: {
      runId: result.runId,
      mode: result.mode,
      modelId: result.modelId,
      evalSkillId: result.evalSkillId,
      evalSkillVersion: result.evalSkillVersion,
      evalSkillGithubUrl: result.evalSkillGithubUrl,
      taskSetId: result.taskSetId,
      taskIds: result.taskIds,
      repeats: result.repeats,
      aggregate: result.aggregate,
      decoding: result.decoding,
      pipeline: result.pipeline,
    },
    scorecard: {
      label,
      score: result.score,
      scoreSpread: spread,
      tasksPassed: perTask.filter((t) => t.score === 1).length,
      tasksTotal: perTask.length,
      perTask,
    },
    harnessChecks: {
      knownGoodSupported: true,
      knownBadSupported: true,
      note:
        "Fixtures include known-good / known-bad artifacts for harness smoke (FAKE_PRODUCE=known-good). " +
        "This report’s scorecard is from the selected run’s produce→grade path, not a separate A/B model bake-off.",
    },
    constraints: [
      "Official mode requires ≥3 repeats; dry-run may use fewer.",
      "Grade is script/tests vs expected fixtures — not an LLM-as-judge.",
      "No multi-model comparison dashboard in MVP.",
      "Cost hard-stop may null the score (budget_stop).",
      "Result ≠ KH-adoption proof (see disclaimer).",
      result.mode === "dry-run"
        ? "Dry-run uses a cheaper model and may use a subset of tasks — not an official claim."
        : "Official run uses the locked official model and full task set.",
    ],
    cost: {
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      status: result.status,
      findings: result.findings,
    },
  };
}

/** Markdown suitable for copy/paste into reviews. */
export function benefitReportToMarkdown(report: BenefitReport): string {
  const c = report.config;
  const s = report.scorecard;
  const v = report.verdict;
  const lines: string[] = [
    `# ${report.title}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Tuomio / Verdict",
    "",
    `**${v.headline}**`,
    "",
    `- Decision: **${v.decision}**`,
    `- Recommendation: \`${v.recommendation}\``,
    "",
    v.rationale,
    "",
    "## Disclaimer",
    "",
    report.disclaimer,
    "",
    "## Decision question",
    "",
    report.decisionQuestion,
    "",
    "## Config",
    "",
    `- Run: \`${c.runId}\``,
    `- Mode: \`${c.mode}\``,
    `- Model: \`${c.modelId}\``,
    `- Skill: \`${c.evalSkillId}\` (SHA \`${c.evalSkillVersion}\`)`,
  ];
  if (c.evalSkillGithubUrl) {
    lines.push(`- Skill GitHub: ${c.evalSkillGithubUrl}`);
  }
  lines.push(
    `- Task set: \`${c.taskSetId}\``,
    `- Tasks: ${c.taskIds.join(", ")}`,
    `- Repeats: ${c.repeats} (${c.aggregate})`,
    `- Decoding: temp=${c.decoding.temperature}, top_p=${c.decoding.top_p}, seed=${c.decoding.seed ?? "—"}`,
    `- Pipeline: ${c.pipeline.produce} → ${c.pipeline.grade}`,
    "",
    "## Scorecard",
    "",
    `- Label: **${s.label}**`,
    `- Score: **${s.score ?? "—"}** (spread ${s.scoreSpread.toFixed(4)})`,
    `- Tasks: ${s.tasksPassed}/${s.tasksTotal} passed`,
    "",
    "| Task | Score | Status | Label |",
    "| --- | --- | --- | --- |",
    ...s.perTask.map(
      (t) => `| ${t.taskId} | ${t.score ?? "—"} | ${t.status} | ${t.label} |`,
    ),
    "",
    "## Harness checks",
    "",
    `- Known-good fixtures: ${report.harnessChecks.knownGoodSupported ? "yes" : "no"}`,
    `- Known-bad fixtures: ${report.harnessChecks.knownBadSupported ? "yes" : "no"}`,
    "",
    report.harnessChecks.note,
    "",
    "## Constraints",
    "",
    ...report.constraints.map((x) => `- ${x}`),
    "",
    "## Cost",
    "",
    `- Status: \`${report.cost.status}\``,
    `- Cost USD: $${report.cost.costUsd.toFixed(4)}`,
    `- Latency: ${Math.round(report.cost.latencyMs / 1000)}s`,
    report.cost.findings.length > 0
      ? `- Findings: ${report.cost.findings.join("; ")}`
      : "- Findings: (none)",
    "",
  );
  return lines.join("\n");
}
