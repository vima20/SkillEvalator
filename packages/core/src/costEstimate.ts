/** Rough token assumptions for UI cost preview (not a bill). */
const ASSUMED_INPUT_TOKENS = 1_800;
const ASSUMED_OUTPUT_TOKENS = 900;

type ModelRate = { inputPerMTok: number; outputPerMTok: number };

const RATES: Record<string, ModelRate> = {
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
};

const DEFAULT_RATE = RATES["gpt-4o-mini"]!;

export function estimateCallCostUsd(modelId: string): number {
  const rate = RATES[modelId] ?? DEFAULT_RATE;
  return (
    (ASSUMED_INPUT_TOKENS * rate.inputPerMTok +
      ASSUMED_OUTPUT_TOKENS * rate.outputPerMTok) /
    1_000_000
  );
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
