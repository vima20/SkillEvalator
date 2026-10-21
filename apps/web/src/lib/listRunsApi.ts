import { resolveListRunEvaluationId } from "@/lib/runDetailEvaluationPack";

export type ListRunApiSource = {
  runId: string;
  status?: unknown;
  result?: {
    score?: number | null;
    modelId?: string;
    mode?: string;
    role?: string;
    evaluationId?: string;
  } | null;
};

export type ListRunApiRow = {
  runId: string;
  status: unknown;
  score: number | null;
  modelId?: string;
  mode?: string;
  role?: string;
  /** Same status → job → result id as SSR lists / run detail. */
  evaluationId: string | null;
  /** Alias for GET /api/runs/[runId] clients that read resolvedEvaluationId. */
  resolvedEvaluationId: string | null;
};

/**
 * Map one listRuns() entry for GET /api/runs.
 * Do not use result?.evaluationId alone — listRuns merge is result-first.
 */
export function toListRunApiRow(
  entry: ListRunApiSource,
  opts?: {
    resolveEvaluationId?: (args: {
      runId: string;
      result?: ListRunApiSource["result"];
    }) => string | null;
  },
): ListRunApiRow {
  const resolve = opts?.resolveEvaluationId ?? resolveListRunEvaluationId;
  const evaluationId = resolve({
    runId: entry.runId,
    result: entry.result,
  });
  return {
    runId: entry.runId,
    status: entry.status,
    score: entry.result?.score ?? null,
    modelId: entry.result?.modelId,
    mode: entry.result?.mode,
    role: entry.result?.role,
    evaluationId,
    resolvedEvaluationId: evaluationId,
  };
}
