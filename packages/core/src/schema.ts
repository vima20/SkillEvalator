import { z } from "zod";

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
  status: z.enum(["ok", "failed", "cancelled", "budget_stop"]),
});

export const RunResultSchema = z.object({
  runId: z.string(),
  evalSkillId: z.string(),
  evalSkillVersion: z.string(),
  taskSetId: z.string(),
  taskIds: z.array(z.string()),
  pipeline: z.object({
    produce: z.literal("model"),
    grade: z.literal("docker_script"),
  }),
  modelId: z.string(),
  decoding: z.object({
    temperature: z.number(),
    top_p: z.number(),
    seed: z.number().optional(),
  }),
  repeats: z.number().int().positive(),
  aggregate: z.enum(["mean", "median"]).default("mean"),
  scoreSpread: z.number().optional(),
  perTask: z.array(PerTaskResultSchema),
  score: z.number().min(0).max(1).nullable(),
  subscores: z.record(z.number()).default({}),
  rationale: z.string().default(""),
  findings: z.array(z.string()).default([]),
  costUsd: z.number().nonnegative().default(0),
  latencyMs: z.number().nonnegative().default(0),
  status: z.enum(["ok", "failed", "cancelled", "budget_stop", "running", "queued"]),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  mode: z.enum(["dry-run", "official"]),
});

export type RunResult = z.infer<typeof RunResultSchema>;

export const JobManifestSchema = z.object({
  runId: z.string(),
  evalSkillId: z.string(),
  mode: z.enum(["dry-run", "official"]),
  modelId: z.string().optional(),
  repeats: z.number().int().positive().default(1),
  createdAt: z.string(),
});

export type JobManifest = z.infer<typeof JobManifestSchema>;
