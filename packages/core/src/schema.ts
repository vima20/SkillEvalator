import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "ok",
  "failed",
  "cancelled",
  "budget_stop",
]);

export const RunStatusSchema = z.enum([
  "ok",
  "failed",
  "cancelled",
  "budget_stop",
  "running",
  "queued",
]);

/** Safe id: no path separators or traversal (matches paths.assertSafeId). */
const SafeIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, "invalid id");

/** https-only URL safe for use in <a href>. */
const HttpsUrlSchema = z
  .string()
  .url()
  .refine((u) => {
    try {
      return new URL(u).protocol === "https:";
    } catch {
      return false;
    }
  }, "https URL required");

export const SkillManifestSchema = z.object({
  taskSetId: z.string().min(1),
  /** Canonical GitHub URL for the skill directory (tree or blob). */
  githubUrl: HttpsUrlSchema,
  taskIds: z.array(z.string().min(1)).min(1),
  dryRunIds: z.array(z.string().min(1)).min(1),
  targetFile: z.record(z.string().min(1)),
});

export type SkillManifest = z.output<typeof SkillManifestSchema>;

export const ScriptResultSchema = z.object({
  name: z.string(),
  exitCode: z.number(),
  summary: z.string(),
});

export const PerTaskResultSchema = z.object({
  taskId: z.string(),
  artifactRef: z.string().optional(),
  expectedRef: z.string().optional(),
  scriptResults: z.array(ScriptResultSchema),
  score: z.number().min(0).max(1).nullable(),
  status: TaskStatusSchema,
});

export const RunResultSchema = z.object({
  runId: z.string(),
  evalSkillId: z.string(),
  evalSkillVersion: z.string(),
  /** GitHub URL of the skill at run time (from skill manifest). */
  evalSkillGithubUrl: HttpsUrlSchema.optional(),
  taskSetId: z.string(),
  taskIds: z.array(z.string()),
  pipeline: z.object({
    produce: z.literal("model"),
    grade: z.enum(["docker_script", "host_script"]),
  }),
  modelId: z.string(),
  decoding: z.object({
    temperature: z.number(),
    top_p: z.number(),
    seed: z.number().optional(),
  }),
  repeats: z.number().int().positive().max(10),
  aggregate: z.literal("mean").default("mean"),
  scoreSpread: z.number().optional(),
  perTask: z.array(PerTaskResultSchema),
  score: z.number().min(0).max(1).nullable(),
  subscores: z.record(z.number()).default({}),
  rationale: z.string().default(""),
  findings: z.array(z.string()).default([]),
  costUsd: z.number().nonnegative().default(0),
  latencyMs: z.number().nonnegative().default(0),
  status: RunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  mode: z.enum(["dry-run", "official"]),
});

export type RunResult = z.output<typeof RunResultSchema>;

export const JobManifestSchema = z.object({
  runId: SafeIdSchema,
  evalSkillId: SafeIdSchema,
  mode: z.enum(["dry-run", "official"]),
  modelId: z.string().optional(),
  repeats: z.number().int().positive().max(10).default(1),
  createdAt: z.string(),
});

export type JobManifest = z.output<typeof JobManifestSchema>;
