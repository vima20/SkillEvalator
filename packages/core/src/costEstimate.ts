/** Rough token assumptions for UI cost preview (not a bill). */
const ASSUMED_INPUT_TOKENS = 1_800;
const ASSUMED_OUTPUT_TOKENS = 900;

/**
 * Inflate pre-produce estimates so a large real call is less likely to
 * blow past COST_CAP_USD before the hard-stop can react.
 */
export const COST_PRECHECK_SAFETY = 1.5;

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

/** Conservative per-call estimate for worker cost-cap pre-check. */
export function estimateCallCostUsdForCap(modelId: string): number {
  return estimateCallCostUsd(modelId) * COST_PRECHECK_SAFETY;
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
