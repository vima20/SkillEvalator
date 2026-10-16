/**
 * Rough token assumptions for UI cost preview (not a bill).
 * Sized for SKILL.md + subject fixtures (CDE-scale), not a tiny stub prompt.
 */
const ASSUMED_INPUT_TOKENS = 12_000;
const ASSUMED_OUTPUT_TOKENS = 1_200;

/**
 * Inflate pre-produce estimates so a large real call is less likely to
 * blow past COST_CAP_USD before the hard-stop can react.
 */
export const COST_PRECHECK_SAFETY = 1.75;

type ModelRate = { inputPerMTok: number; outputPerMTok: number };

const RATES: Record<string, ModelRate> = {
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
};

/** Conservative fallback: unknown models use the most expensive known rate. */
const UNKNOWN_MODEL_RATE = RATES["gpt-4.1-mini"]!;

function rateForModel(modelId: string): ModelRate {
  return RATES[modelId] ?? UNKNOWN_MODEL_RATE;
}

/** Actual USD from token usage using the same rate table as estimates. */
export function costFromTokenUsage(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rate = rateForModel(modelId);
  const inTok = Math.max(0, promptTokens);
  const outTok = Math.max(0, completionTokens);
  const usd =
    (inTok * rate.inputPerMTok + outTok * rate.outputPerMTok) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export function estimateCallCostUsd(modelId: string): number {
  const rate = rateForModel(modelId);
  return (
    (ASSUMED_INPUT_TOKENS * rate.inputPerMTok +
      ASSUMED_OUTPUT_TOKENS * rate.outputPerMTok) /
    1_000_000
  );
}

/** Worst-case one-call cost if the model uses the full max_tokens budget. */
export function estimateMaxCallCostUsd(
  modelId: string,
  maxOutputTokens: number,
): number {
  const rate = rateForModel(modelId);
  const outTok = Math.max(0, maxOutputTokens);
  return (
    (ASSUMED_INPUT_TOKENS * rate.inputPerMTok +
      outTok * rate.outputPerMTok) /
    1_000_000
  );
}

/**
 * Conservative per-call estimate for worker cost-cap pre-check.
 * Uses the larger of inflated typical usage and full max_tokens worst case.
 */
export function estimateCallCostUsdForCap(
  modelId: string,
  maxOutputTokens?: number,
): number {
  const typical = estimateCallCostUsd(modelId) * COST_PRECHECK_SAFETY;
  if (maxOutputTokens == null || !(maxOutputTokens > 0)) return typical;
  return Math.max(typical, estimateMaxCallCostUsd(modelId, maxOutputTokens));
}

/**
 * True when the next produce call is expected to push total spend past the cap.
 * Used as a pre-flight guard before OpenAI (actual usage may still overrun).
 */
export function wouldExceedCostCap(opts: {
  spentUsd: number;
  nextCallUsd: number;
  capUsd: number;
}): boolean {
  const spent = Math.max(0, opts.spentUsd);
  const next = Math.max(0, opts.nextCallUsd);
  const cap = Math.max(0, opts.capUsd);
  if (spent >= cap) return true;
  return spent + next > cap;
}

/**
 * Clamp max_tokens so worst-case output cost fits in remaining budget
 * (after assumed/estimated input). Returns 0 when even a tiny completion
 * would exceed the remaining USD.
 */
export function maxOutputTokensForRemainingBudget(opts: {
  modelId: string;
  remainingUsd: number;
  maxOutputTokens: number;
  estimatedInputTokens?: number;
}): number {
  const maxOut = Math.max(0, Math.floor(opts.maxOutputTokens));
  if (maxOut <= 0) return 0;
  const remaining = Math.max(0, opts.remainingUsd);
  if (remaining <= 0) return 0;
  const rate = rateForModel(opts.modelId);
  const inTok = Math.max(
    0,
    Math.floor(opts.estimatedInputTokens ?? ASSUMED_INPUT_TOKENS),
  );
  const inputCostUsd = (inTok * rate.inputPerMTok) / 1_000_000;
  const forOutput = remaining - inputCostUsd;
  if (forOutput <= 0) return 0;
  const affordable = Math.floor((forOutput * 1_000_000) / rate.outputPerMTok);
  return Math.max(0, Math.min(maxOut, affordable));
}

/** Rough token estimate from UTF-8 text (~4 chars/token). */
export function estimateTokensFromText(text: string): number {
  const chars = text?.length ?? 0;
  return Math.max(1, Math.ceil(chars / 4));
}

export function estimateRunCostUsd(opts: {
  taskCount: number;
  repeats: number;
  modelId: string;
}): {
  calls: number;
  estimatedUsd: number;
  perCallUsd: number;
  modelId: string;
} {
  const tasks = Math.max(0, Math.floor(opts.taskCount));
  const repeats = Math.max(0, Math.floor(opts.repeats));
  const calls = tasks * repeats;
  const perCallUsd = estimateCallCostUsd(opts.modelId);
  return {
    calls,
    perCallUsd,
    estimatedUsd: Math.round(calls * perCallUsd * 10_000) / 10_000,
    modelId: opts.modelId,
  };
}

/**
 * Per-leg UI / enqueue bar: one run's estimate vs COST_CAP_USD.
 * Paired baseline↔candidate doubles total spend but each leg caps separately.
 */
export function perLegEstimateExceedsCap(opts: {
  taskCount: number;
  repeats: number;
  modelId: string;
  costCapUsd: number;
}): boolean {
  const est = estimateRunCostUsd({
    taskCount: opts.taskCount,
    repeats: opts.repeats,
    modelId: opts.modelId,
  });
  return est.estimatedUsd > opts.costCapUsd;
}

export type EnqueueCostCapOk = { ok: true };

export type EnqueueCostCapDenied = {
  ok: false;
  status: 400;
  errorCode: "enqueue_cost_over_cap";
  error: string;
  estimatedUsd: number;
  costCapUsd: number;
};

/** Fail-closed enqueue admission matching New run cost-over-cap UI. */
export function enqueueCostCapGate(opts: {
  taskCount: number;
  repeats: number;
  modelId: string;
  costCapUsd: number;
}): EnqueueCostCapOk | EnqueueCostCapDenied {
  const est = estimateRunCostUsd({
    taskCount: opts.taskCount,
    repeats: opts.repeats,
    modelId: opts.modelId,
  });
  if (est.estimatedUsd <= opts.costCapUsd) return { ok: true };
  return {
    ok: false,
    status: 400,
    errorCode: "enqueue_cost_over_cap",
    estimatedUsd: est.estimatedUsd,
    costCapUsd: opts.costCapUsd,
    error: `per-leg estimate $${est.estimatedUsd.toFixed(4)} exceeds COST_CAP_USD $${opts.costCapUsd} — lower repeats/tasks or raise the cap (worker may budget_stop)`,
  };
}
