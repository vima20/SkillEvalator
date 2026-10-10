import { JobManifestSchema, type JobManifest } from "./schema.js";

export const OFFICIAL_MIN_REPEATS = 3;
export const MAX_REPEATS = 10;

export function normalizeRepeats(
  mode: JobManifest["mode"],
  repeats: number,
): number {
  const n = Number.isFinite(repeats) && repeats > 0 ? Math.floor(repeats) : 1;
  const capped = Math.min(n, MAX_REPEATS);
  return mode === "official" ? Math.max(capped, OFFICIAL_MIN_REPEATS) : capped;
}

export function createJobManifest(input: {
  runId: string;
  evalSkillId: string;
  mode: JobManifest["mode"];
  repeats?: number;
  modelId?: string;
  createdAt?: string;
}): JobManifest {
  return JobManifestSchema.parse({
    runId: input.runId,
    evalSkillId: input.evalSkillId,
    mode: input.mode,
    modelId: input.modelId,
    repeats: normalizeRepeats(input.mode, input.repeats ?? 1),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
