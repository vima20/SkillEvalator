/**
 * Pin produce modelId to mode before paid calls.
 * Allowlist alone is not enough — dry-run must not run the official model.
 */

export function resolveRunModelId(opts: {
  mode: "dry-run" | "official";
  jobModelId?: string;
  modelDryRun: string;
  modelOfficial: string;
}): string {
  const expected =
    opts.mode === "official" ? opts.modelOfficial : opts.modelDryRun;
  const allowed = new Set([opts.modelDryRun, opts.modelOfficial]);
  if (opts.jobModelId) {
    if (!allowed.has(opts.jobModelId)) {
      throw new Error(`modelId not allowlisted: ${opts.jobModelId}`);
    }
    if (opts.jobModelId !== expected) {
      throw new Error(
        `modelId ${opts.jobModelId} incompatible with mode ${opts.mode}; expected ${expected}`,
      );
    }
    return opts.jobModelId;
  }
  return expected;
}
