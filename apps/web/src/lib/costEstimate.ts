/** Client-safe cost preview (mirrors @skillevalator/core estimateRunCostUsd). */

/** Sized for SKILL.md + subject fixtures — keep in sync with packages/core. */
const ASSUMED_INPUT_TOKENS = 12_000;
const ASSUMED_OUTPUT_TOKENS = 1_200;

const RATES: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
};

/** Conservative: unknown models use the most expensive known rate. */
const UNKNOWN_MODEL_RATE = RATES["gpt-4.1-mini"]!;

export function estimateRunCostUsd(opts: {
  taskCount: number;
  repeats: number;
  modelId: string;
}): { calls: number; estimatedUsd: number; modelId: string } {
  const rate = RATES[opts.modelId] ?? UNKNOWN_MODEL_RATE;
  const perCall =
    (ASSUMED_INPUT_TOKENS * rate.inputPerMTok +
      ASSUMED_OUTPUT_TOKENS * rate.outputPerMTok) /
    1_000_000;
  const calls =
    Math.max(0, Math.floor(opts.taskCount)) *
    Math.max(0, Math.floor(opts.repeats));
  return {
    calls,
    estimatedUsd: Math.round(calls * perCall * 10_000) / 10_000,
    modelId: opts.modelId,
  };
}
