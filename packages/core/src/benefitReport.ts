import type { RunResult } from "./schema.js";
import { labelForScore, type ScoreLabel } from "./scoring.js";

/** Harness recommendation: should Unikie use this skill (for this model/mode)? */
export type SkillUseVerdict = "use" | "do_not_use" | "inconclusive";

export type BenefitVerdict = {
  recommendation: SkillUseVerdict;
  /** Short English headline for UI. */
  headline: string;
  /** One-line English decision for Markdown/export. */
  decision: string;
  rationale: string;
};

export type ReviewSection = {
  heading: string;
  body: string;
};

/** 1–5 star rating plus English letter-style grade and prose review. */
export type BenefitRating = {
  stars: 1 | 2 | 3 | 4 | 5;
  /** Visual string e.g. ★★★★☆ */
  starsDisplay: string;
  /** English grade word */
  grade: string;
  /** Short English tagline under stars */
  summary: string;
  /** Structured written assessment for UI */
  reviewSections: ReviewSection[];
  /** Flat prose for Markdown export */
  review: string;
};

export type BenefitReport = {
  title: string;
  generatedAt: string;
  /** Explicit: harness score ≠ KH-adoption proof. */
  disclaimer: string;
  decisionQuestion: string;
  verdict: BenefitVerdict;
  rating: BenefitRating;
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
  "Should Unikie engineering use this eval skill with this model?";

function starsDisplay(n: 1 | 2 | 3 | 4 | 5): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function gradeForStars(stars: 1 | 2 | 3 | 4 | 5): string {
  switch (stars) {
    case 5:
      return "Excellent";
    case 4:
      return "Good";
    case 3:
      return "Fair";
    case 2:
      return "Poor";
    default:
      return "Weak";
  }
}

/**
 * Map scorecard + mode into 1–5 stars.
 * Dry-run is capped at 4 even on a perfect score (official required for 5).
 */
export function rateSkill(result: RunResult): BenefitRating {
  const score = result.score;
  const status = result.status;
  const passed = result.perTask.filter((t) => t.score === 1).length;
  const total = result.perTask.length;
  const failedTasks = result.perTask
    .filter((t) => t.score !== 1)
    .map((t) => t.taskId);

  let stars: 1 | 2 | 3 | 4 | 5 = 1;

  if (status === "cancelled" || status === "budget_stop" || score === null) {
    stars = 1;
  } else if (score <= 0) {
    stars = 1;
  } else if (score < 0.34) {
    stars = 2;
  } else if (score < 0.67) {
    stars = 3;
  } else if (score < 1) {
    stars = 4;
  } else if (result.mode === "dry-run") {
    stars = 4;
  } else {
    stars = 5;
  }

  const grade = gradeForStars(stars);
  const scoreTxt = score === null ? "—" : score.toFixed(2);
  const spread = result.scoreSpread ?? 0;
  const label = score === null ? "Fail" : labelForScore(score, spread);
  const costTxt = `$${result.costUsd.toFixed(4)}`;
  const latencyTxt = `${Math.round(result.latencyMs / 1000)} s`;

  let summary: string;
  let reviewSections: ReviewSection[];

  if (status === "cancelled" || status === "budget_stop") {
    summary = "Run stopped early — no reliable grade.";
    reviewSections = [
      {
        heading: "Situation",
        body: `The ${result.evalSkillId} run (${result.modelId}) ended with status ${status}. The scorecard was not completed, so no adoption recommendation can be made.`,
      },
      {
        heading: "Why this is not enough",
        body:
          status === "cancelled"
            ? "Cancel cut the pipeline mid-run. Partial artifacts do not show whether the skill would pass the full task set."
            : "A cost hard-stop (budget_stop) ended the run. A null score is neither a negative nor a positive result — it is a missing measurement.",
      },
      {
        heading: "Recommendation",
        body: "Re-run without interruption. Once dry-run is clean, run official (≥3 repeats) before offering the skill to the team.",
      },
    ];
  } else if (score === null || score <= 0) {
    summary = "Skill produced no passing tasks.";
    reviewSections = [
      {
        heading: "Result",
        body: `${result.evalSkillId} scored ${grade} (${stars}/5). With model ${result.modelId} on task set ${result.taskSetId}, score was ${scoreTxt} — ${passed}/${total || "0"} tasks passed.`,
      },
      {
        heading: "What went wrong",
        body: failedTasks.length
          ? `Every evaluated task fell short. Notably: ${failedTasks.join(", ")}. The model did not produce a grade-passing fix, or the skill instructions/fixtures do not steer correctly.`
          : "No task passed. The pipeline ran technically, but the produce→grade chain did not yield an acceptable result.",
      },
      {
        heading: "Recommendation",
        body: "Do not adopt the skill. Inspect failed artifacts, tighten SKILL.md guidance or fixtures, and repeat dry-run until score is 1.0.",
      },
    ];
  } else if (score < 1) {
    summary = "Partial pass — not ready for use yet.";
    const failList = failedTasks.length
      ? `Failed tasks (${failedTasks.length}): ${failedTasks.join(", ")}.`
      : "Some tasks remained incomplete.";
    reviewSections = [
      {
        heading: "Result",
        body: `${result.evalSkillId} scored ${grade} (${stars}/5). Score ${scoreTxt} means ${passed}/${total} passes with ${result.modelId} (${result.mode}). Duration ${latencyTxt}, cost ${costTxt}.`,
      },
      {
        heading: "Analysis",
        body: `${failList} A partial pass shows the skill/model hits some cases but is not yet reliable across the full set. In team use that means intermittent regressions on the bug types that currently fail grade.`,
      },
      {
        heading: "Recommendation",
        body:
          result.mode === "dry-run"
            ? "Do not proceed to official until dry-run is fully clean (score 1.0). Fix the weak tasks first — otherwise official only confirms the same incomplete picture at higher cost."
            : "Do not adopt the skill. Official runs require score 1.0. Fix failing tasks and re-run official (≥3 repeats).",
      },
    ];
  } else if (result.mode === "dry-run") {
    summary = "Promising dry-run — official still required.";
    reviewSections = [
      {
        heading: "Result",
        body: `${result.evalSkillId} completed dry-run cleanly: ${passed}/${total} tasks passed with ${result.modelId} (score ${scoreTxt}). Grade ${grade} (${stars}/5). Duration ${latencyTxt}, cost ${costTxt}.`,
      },
      {
        heading: "What this shows",
        body: `The dry-run task subset (${result.taskIds.join(", ")}) and the skill instructions appear to work together: the model produced grade-passing fixes. That is a strong signal about the harness and skill content — not yet a signal for production use.`,
      },
      {
        heading: "Why not 5/5 or USE",
        body: "Dry-run intentionally uses a cheaper model and only a subset of tasks. Stars are therefore capped below five, and the verdict stays short of USE until an official run (≥3 repeats, locked official model, full task set).",
      },
      {
        heading: "Recommendation",
        body: "Continue to an official run with the same skill. If official is also clean, the recommendation becomes USE. Do not share the skill with the team on dry-run alone.",
      },
    ];
  } else {
    summary = "Official passed — skill is fit for use with this model.";
    reviewSections = [
      {
        heading: "Result",
        body: `${result.evalSkillId} passed official evaluation at ${grade} (${stars}/5). Score ${scoreTxt}, label ${label}, spread ${spread.toFixed(3)}. Model ${result.modelId}, task set ${result.taskSetId}, ${passed}/${total} tasks, repeats ${result.repeats}. Duration ${latencyTxt}, cost ${costTxt}.`,
      },
      {
        heading: "What this shows",
        body: "The locked official setup produced a full pass. The skill prompt, fixtures, and grade scripts form a working chain for this model — exactly what the MVP Benefit Report needs for a use recommendation.",
      },
      {
        heading: "Recommendation",
        body: `Adopt ${result.evalSkillId} together with ${result.modelId}. Track cost and re-run regression when fixtures or SKILL.md change.`,
      },
      {
        heading: "Limitation",
        body: "This measurement covers only the produce→grade pipeline. It is not proof of Cursor/KH skill adoption in the organization.",
      },
    ];
  }

  // Shared closing note unless official pass already has Limitation section
  if (
    status !== "cancelled" &&
    status !== "budget_stop" &&
    !(result.mode === "official" && score === 1)
  ) {
    reviewSections.push({
      heading: "Limitation",
      body: "This assessment measures harness pass only (produce→grade). It is not proof of Cursor/KH skill adoption.",
    });
  }

  const review = reviewSections
    .map((s) => `**${s.heading}.** ${s.body}`)
    .join("\n\n");

  return {
    stars,
    starsDisplay: starsDisplay(stars),
    grade,
    summary,
    reviewSections,
    review,
  };
}

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
      headline: "INCONCLUSIVE — run stopped early",
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
      headline: "DO NOT USE — no valid pass",
      decision: "DO NOT USE — no valid passing scorecard",
      rationale:
        "Run did not produce a usable passing score. Do not rely on this skill/model pairing until a clean official pass exists.",
    };
  }

  if (result.mode === "dry-run") {
    if (score < 1) {
      return {
        recommendation: "do_not_use",
        headline: "DO NOT USE — dry-run failed",
        decision: "DO NOT USE — dry-run failed the task set",
        rationale: `Dry-run score ${score.toFixed(2)} < 1. Fix the skill/model pairing before investing in an official run.`,
      };
    }
    return {
      recommendation: "inconclusive",
      headline: "INCONCLUSIVE — run official",
      decision: "INCONCLUSIVE — dry-run passed; official run required",
      rationale:
        "Dry-run passed on a task subset with the cheaper model. That is encouraging but not enough to recommend production use. Run mode=official (≥3 repeats) before adopting the skill.",
    };
  }

  if (score < 1) {
    return {
      recommendation: "do_not_use",
      headline: "DO NOT USE — official failed",
      decision: "DO NOT USE — official evaluation failed",
      rationale: `Official score ${score.toFixed(2)} < 1 on task set ${result.taskSetId}. Do not use this skill with ${result.modelId} until it reaches a full pass.`,
    };
  }

  return {
    recommendation: "use",
    headline: "USE — official passed",
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
  const rating = rateSkill(result);

  return {
    title: `Benefit Report · ${result.evalSkillId} · ${result.runId}`,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    decisionQuestion: DECISION_QUESTION,
    verdict,
    rating,
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
  const r = report.rating;
  const lines: string[] = [
    `# ${report.title}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Verdict",
    "",
    `**${v.headline}**`,
    "",
    `- Decision: **${v.decision}**`,
    `- Recommendation: \`${v.recommendation}\``,
    "",
    v.rationale,
    "",
    "## Rating",
    "",
    `${r.starsDisplay}  **${r.stars}/5 · ${r.grade}**`,
    "",
    r.summary,
    "",
    "## Written review",
    "",
    ...r.reviewSections.flatMap((s) => [`### ${s.heading}`, "", s.body, ""]),
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
