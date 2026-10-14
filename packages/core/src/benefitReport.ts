import type { ComparisonVerdict, RunComparison } from "./comparison.js";
import {
  OFFICIAL_USE_SCORE_FLOOR,
  PASS_SCORE_FLOOR,
} from "./diffScore.js";
import type { RunResult } from "./schema.js";
import { labelForScore, type ScoreLabel } from "./scoring.js";

function taskPassedSoft(score: number | null | undefined): boolean {
  return typeof score === "number" && score >= PASS_SCORE_FLOOR;
}

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
    role?: RunResult["role"];
    evaluationId?: string;
    commit?: string;
    license?: string;
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
  const passed = result.perTask.filter((t) => taskPassedSoft(t.score)).length;
  const total = result.perTask.length;
  const failedTasks = result.perTask
    .filter((t) => !taskPassedSoft(t.score))
    .map((t) => t.taskId);

  const smokeHarness = result.capture?.env?.fakeProduce === true;
  const roleMissing = result.role === undefined;
  /** Align with decideSkillUse — these must not look like Excellent / USE. */
  const adoptionBlocked =
    smokeHarness || roleMissing || status === "failed";

  let stars: 1 | 2 | 3 | 4 | 5 = 1;

  if (
    status === "cancelled" ||
    status === "budget_stop" ||
    status === "failed" ||
    score === null ||
    smokeHarness ||
    roleMissing
  ) {
    stars = 1;
  } else if (score <= 0) {
    stars = 1;
  } else if (score < 0.34) {
    stars = 2;
  } else if (score < 0.67) {
    stars = 3;
  } else if (score < OFFICIAL_USE_SCORE_FLOOR) {
    stars = 4;
  } else if (result.mode === "dry-run") {
    // Dry-run never earns 5★ even at a perfect score.
    stars = 4;
  } else {
    // Official USE gate aligns with decideSkillUse + Comparison PASS.
    stars = 5;
  }

  const grade = gradeForStars(stars);
  const scoreTxt = score === null ? "—" : score.toFixed(2);
  const spread = result.scoreSpread ?? 0;
  const meanDiffRatio = result.subscores?.meanDiffRatio;
  const label =
    score === null
      ? "Fail"
      : labelForScore(score, {
          scoreSpread: spread,
          ...(typeof meanDiffRatio === "number" ? { meanDiffRatio } : {}),
        });
  const costTxt = `$${result.costUsd.toFixed(4)}`;
  const latencyTxt = `${Math.round(result.latencyMs / 1000)} s`;

  let summary: string;
  let reviewSections: ReviewSection[];

  if (smokeHarness) {
    summary = "Smoke harness — not an adoption grade.";
    reviewSections = [
      {
        heading: "Situation",
        body: `${result.evalSkillId} used FAKE_PRODUCE=known-good (fixture smoke). Stars stay at ${stars}/5; scores are not a live-model adoption signal.`,
      },
      {
        heading: "Recommendation",
        body: "Re-run with a live model produce (FAKE_PRODUCE unset) before reading Benefit USE or star ratings as adoption advice.",
      },
    ];
  } else if (roleMissing) {
    summary = "Missing eval role — rating withheld.";
    reviewSections = [
      {
        heading: "Situation",
        body: "RunResult.role is unset. Benefit cannot assume candidate, so the star rating stays at the floor.",
      },
      {
        heading: "Recommendation",
        body: "Re-run with an explicit baseline or candidate role, or open Comparison for the paired evaluation.",
      },
    ];
  } else if (status === "failed") {
    summary = "Run failed — no adoption grade.";
    reviewSections = [
      {
        heading: "Situation",
        body: `${result.evalSkillId} ended with status failed (score ${scoreTxt}). A failed terminal status is not a USE signal even when a partial score exists.`,
      },
      {
        heading: "Recommendation",
        body: "Fix the failure (skill, fixtures, or harness), then re-run dry-run and official before adopting.",
      },
    ];
  } else if (status === "cancelled" || status === "budget_stop") {
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
        body: `${result.evalSkillId} scored ${grade} (${stars}/5). With model ${result.modelId} on task set ${result.taskSetId}, score was ${scoreTxt} — ${passed}/${total || "0"} soft-pass (≥0.8).`,
      },
      {
        heading: "What went wrong",
        body: failedTasks.length
          ? `Every evaluated task fell short of the soft-pass floor (≥0.8). Notably: ${failedTasks.join(", ")}. The model did not produce a grade-passing fix, or the skill instructions/fixtures do not steer correctly.`
          : "No task soft-passed. The pipeline ran technically, but the produce→grade chain did not yield an acceptable result.",
      },
      {
        heading: "Recommendation",
        body: "Do not adopt the skill. Inspect failed artifacts, tighten SKILL.md guidance or fixtures, and repeat dry-run until score ≈1.0 (not only soft-pass).",
      },
    ];
  } else if (
    (result.mode === "dry-run" && score < 1) ||
    (result.mode === "official" && score < OFFICIAL_USE_SCORE_FLOOR)
  ) {
    const allSoftPass = failedTasks.length === 0 && total > 0;
    summary = allSoftPass
      ? "Soft-pass complete — short of USE (near-perfect score)."
      : "Partial soft-pass — not ready for use yet.";
    const failList = failedTasks.length
      ? `Below soft-pass (≥0.8): ${failedTasks.join(", ")}.`
      : "Every task met the soft-pass floor (≥0.8), but the aggregate score is still below a full expected match.";
    reviewSections = [
      {
        heading: "Result",
        body: `${result.evalSkillId} scored ${grade} (${stars}/5). Score ${scoreTxt} with ${passed}/${total} soft-pass (≥0.8) on ${result.modelId} (${result.mode}). Duration ${latencyTxt}, cost ${costTxt}.`,
      },
      {
        heading: "Analysis",
        body: `${failList} Soft-pass (≥${PASS_SCORE_FLOOR}) is the dry-run Comparison floor. Official Comparison PASS and Benefit USE both require aggregate ≥${OFFICIAL_USE_SCORE_FLOOR} plus lift — grade scripts can pass while output still drifts from expected.`,
      },
      {
        heading: "Recommendation",
        body:
          result.mode === "dry-run"
            ? "Do not proceed to official until dry-run reaches a full expected match (score ≈1.0), not only soft-pass. Otherwise official mostly confirms the same incomplete picture at higher cost."
            : `Do not adopt the skill yet. Official USE / Comparison PASS needs score ≥${OFFICIAL_USE_SCORE_FLOOR}. Soft-pass alone is not enough — tighten SKILL.md / fixtures and re-run official (≥3 repeats).`,
      },
    ];
  } else if (result.mode === "dry-run") {
    summary = "Promising dry-run — official still required.";
    reviewSections = [
      {
        heading: "Result",
        body: `${result.evalSkillId} completed dry-run cleanly: ${passed}/${total} soft-pass with ${result.modelId} (score ${scoreTxt}). Grade ${grade} (${stars}/5). Duration ${latencyTxt}, cost ${costTxt}.`,
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
        body: `${result.evalSkillId} passed official evaluation at ${grade} (${stars}/5). Score ${scoreTxt}, label ${label}, spread ${spread.toFixed(3)}. Model ${result.modelId}, task set ${result.taskSetId}, ${passed}/${total} soft-pass, repeats ${result.repeats}. Duration ${latencyTxt}, cost ${costTxt}.`,
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

  // Shared closing note unless official USE already has Limitation section
  if (
    !adoptionBlocked &&
    status !== "cancelled" &&
    status !== "budget_stop" &&
    !(
      result.mode === "official" &&
      score !== null &&
      score >= OFFICIAL_USE_SCORE_FLOOR
    )
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

function withUpdatedRecommendation(
  rating: BenefitRating,
  stars: 1 | 2 | 3 | 4,
  summary: string,
  recommendationBody: string,
): BenefitRating {
  const reviewSections = [
    ...rating.reviewSections.filter((s) => s.heading !== "Recommendation"),
    { heading: "Recommendation", body: recommendationBody },
  ];
  return {
    ...rating,
    stars,
    starsDisplay: starsDisplay(stars),
    grade: gradeForStars(stars),
    summary,
    reviewSections,
    review: reviewSections.map((s) => `**${s.heading}.** ${s.body}`).join("\n\n"),
  };
}

/**
 * Fail-closed: official candidate USE / 5★ requires Comparison PASS (lift).
 * Score-only USE without a paired PASS is a false adoption signal.
 */
export function applyPairedComparisonGate(opts: {
  result: RunResult;
  verdict: BenefitVerdict;
  rating: BenefitRating;
  comparison?: RunComparison | null;
}): { verdict: BenefitVerdict; rating: BenefitRating } {
  const { result, comparison } = opts;
  let { verdict, rating } = opts;

  const adoptionClaim =
    verdict.recommendation === "use" || rating.stars === 5;
  if (!adoptionClaim) {
    return { verdict, rating };
  }
  if (result.role === "baseline") {
    return { verdict, rating };
  }
  if (result.mode !== "official") {
    return { verdict, rating };
  }
  // Missing / non-candidate role already handled upstream for USE; still
  // demote orphan 5★ if somehow present without a paired PASS.
  if (result.role !== undefined && result.role !== "candidate") {
    return { verdict, rating };
  }

  const liftTxt =
    comparison && typeof comparison.lift === "number"
      ? `lift ${(comparison.lift * 100).toFixed(1)} pp`
      : "lift unknown";

  if (!result.evaluationId) {
    verdict = {
      recommendation: "inconclusive",
      headline: "INCONCLUSIVE — paired Comparison required",
      decision: "INCONCLUSIVE — official single-leg score is not an adoption verdict",
      rationale:
        "Official candidate USE requires a paired baseline↔candidate Comparison PASS (≥ +5 pp lift). This run has no evaluationId — enqueue with baseline↔candidate.",
    };
    rating = withUpdatedRecommendation(
      rating,
      4,
      "Paired Comparison required — not an adoption grade yet.",
      "Re-run as a paired evaluation (baseline↔candidate). Benefit USE stays locked until Comparison is PASS.",
    );
    return { verdict, rating };
  }

  if (!comparison) {
    verdict = {
      recommendation: "inconclusive",
      headline: "INCONCLUSIVE — waiting for Comparison",
      decision: "INCONCLUSIVE — sibling leg or Comparison not ready",
      rationale: `Paired evaluationId ${result.evaluationId} exists, but Comparison is not available yet (missing sibling result). Official score alone is not USE — wait for baseline↔candidate PASS.`,
    };
    rating = withUpdatedRecommendation(
      rating,
      4,
      "Waiting for paired Comparison — USE locked.",
      `Open Comparison for ${result.evaluationId}. Benefit USE unlocks only when that verdict is PASS.`,
    );
    return { verdict, rating };
  }

  const v: ComparisonVerdict = comparison.verdict;
  if (v === "PASS" && comparison.mode === "official") {
    return { verdict, rating };
  }
  if (v === "PASS" && comparison.mode !== "official") {
    verdict = {
      recommendation: "inconclusive",
      headline: "INCONCLUSIVE — Comparison PASS is dry-run only",
      decision: "INCONCLUSIVE — official Comparison PASS required",
      rationale: `Comparison reported PASS but mode is ${comparison.mode} (not official). Benefit USE stays locked until an official paired Comparison PASS.`,
    };
    rating = withUpdatedRecommendation(
      rating,
      4,
      "Dry-run Comparison PASS — USE locked.",
      "Re-run mode=official with baseline↔candidate. Benefit USE requires official Comparison PASS.",
    );
    return { verdict, rating };
  }

  if (v === "FAIL") {
    verdict = {
      recommendation: "do_not_use",
      headline: "DO NOT USE — Comparison FAIL",
      decision: "DO NOT USE — candidate did not clear baseline lift",
      rationale: `Official candidate score met the Benefit floor, but Comparison is FAIL (${liftTxt}; need ≥ +5 pp). Unikie adoption follows Comparison PASS, not score alone.`,
    };
    rating = withUpdatedRecommendation(
      rating,
      3,
      "Comparison FAIL — skill not cleared for use.",
      `Comparison FAIL (${liftTxt}). Fix the skill until baseline↔candidate lift is PASS before adopting.`,
    );
    return { verdict, rating };
  }

  // INCONCLUSIVE
  verdict = {
    recommendation: "inconclusive",
    headline: "INCONCLUSIVE — Comparison not decisive",
    decision: "INCONCLUSIVE — Comparison INCONCLUSIVE; not an adoption verdict",
    rationale: `Comparison for ${result.evaluationId} is INCONCLUSIVE (${comparison.rationale}). Official score cannot unlock Benefit USE until Comparison is PASS.`,
  };
  rating = withUpdatedRecommendation(
    rating,
    4,
    "Comparison INCONCLUSIVE — USE locked.",
    `Resolve Comparison parity/status for ${result.evaluationId}. Benefit USE requires Comparison PASS.`,
  );
  return { verdict, rating };
}

/**
 * Official + perfect score → use.
 * Completed run with imperfect score → do not use.
 * Dry-run / cancelled / budget / smoke / null score → inconclusive.
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

  // FAKE_PRODUCE smoke harness — scores are not an adoption signal.
  if (result.capture?.env?.fakeProduce === true) {
    return {
      recommendation: "inconclusive",
      headline: "INCONCLUSIVE — smoke harness (FAKE_PRODUCE)",
      decision: "INCONCLUSIVE — smoke produce; not an adoption verdict",
      rationale:
        "This run used FAKE_PRODUCE=known-good (fixture smoke). Scores and Benefit USE are not valid for skill adoption — re-run with a live model produce.",
    };
  }

  // Do not invent candidate — missing role must not unlock USE.
  if (result.role === undefined) {
    return {
      recommendation: "inconclusive",
      headline: "INCONCLUSIVE — missing eval role",
      decision: "INCONCLUSIVE — result.role unset; not an adoption verdict",
      rationale:
        "RunResult.role is missing. Benefit cannot assume candidate (that could treat a baseline leg as adoption). Re-run or open Comparison with explicit roles.",
    };
  }

  if (result.role === "baseline") {
    return {
      recommendation: "inconclusive",
      headline: "BASELINE — not an adoption verdict",
      decision: "INCONCLUSIVE — baseline leg only (no skill SKILL.md)",
      rationale:
        "This is the Unikie baseline run (neutral prompt). Open Comparison for the paired candidate lift / PASS–FAIL verdict.",
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

  if (score < OFFICIAL_USE_SCORE_FLOOR) {
    return {
      recommendation: "do_not_use",
      headline: "DO NOT USE — official not Strong",
      decision: "DO NOT USE — official evaluation below full expected match",
      rationale: `Official score ${score.toFixed(2)} < ${OFFICIAL_USE_SCORE_FLOOR} on task set ${result.taskSetId}. Soft-pass (≥${PASS_SCORE_FLOOR}) is not enough — official Comparison PASS and Benefit USE share this near-perfect floor. Do not use this skill with ${result.modelId} until score ≥${OFFICIAL_USE_SCORE_FLOOR}.`,
    };
  }

  const meanDiff = result.subscores?.meanDiffRatio;
  return {
    recommendation: "use",
    headline: "USE — official passed",
    decision: "USE — official evaluation passed",
    rationale: `Official run scored ${score.toFixed(2)} (${labelForScore(score, {
      scoreSpread: result.scoreSpread ?? 0,
      ...(typeof meanDiff === "number" ? { meanDiffRatio: meanDiff } : {}),
    })}) on ${result.taskSetId} with ${result.modelId}. Harness supports using this skill for this pairing. Still not KH-adoption proof.`,
  };
}

export function buildBenefitReport(
  result: RunResult,
  opts?: { comparison?: RunComparison | null },
): BenefitReport {
  const spread = result.scoreSpread ?? 0;
  const meanDiffRatio = result.subscores?.meanDiffRatio;
  const labelOpts = {
    scoreSpread: spread,
    ...(typeof meanDiffRatio === "number" ? { meanDiffRatio } : {}),
  };
  const label = labelForScore(result.score, labelOpts);
  const perTask = result.perTask.map((t) => ({
    taskId: t.taskId,
    score: t.score,
    status: t.status,
    label: labelForScore(t.score, {
      ...(typeof t.diffRatio === "number"
        ? { meanDiffRatio: t.diffRatio, scoreSpread: 0 }
        : {}),
    }),
  }));
  const gated = applyPairedComparisonGate({
    result,
    verdict: decideSkillUse(result),
    rating: rateSkill(result),
    comparison: opts?.comparison,
  });

  return {
    title: `Benefit Report · ${result.evalSkillId} · ${result.runId}`,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    decisionQuestion: DECISION_QUESTION,
    verdict: gated.verdict,
    rating: gated.rating,
    config: {
      runId: result.runId,
      mode: result.mode,
      modelId: result.modelId,
      evalSkillId: result.evalSkillId,
      evalSkillVersion: result.evalSkillVersion,
      evalSkillGithubUrl: result.evalSkillGithubUrl,
      role: result.role,
      evaluationId: result.evaluationId,
      commit: result.capture?.commit,
      license: result.capture?.license,
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
      tasksPassed: perTask.filter((t) => taskPassedSoft(t.score)).length,
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
      "Unikie PASS requires candidate lift ≥ +5 pp over baseline (see Comparison).",
      "Cost hard-stop may null the score (budget_stop).",
      "Result ≠ KH-adoption proof (see disclaimer).",
      result.mode === "dry-run"
        ? "Dry-run uses a cheaper model and may use a subset of tasks — not an official claim."
        : "Official run uses the locked official model and full task set.",
      result.evaluationId
        ? `Paired evaluationId ${result.evaluationId} — Benefit USE / 5★ requires Comparison PASS on this pair.`
        : "Single-leg run (no paired baseline). Official USE is locked until baseline↔candidate Comparison PASS.",
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
