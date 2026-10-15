import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "ok",
  "failed",
  "cancelled",
  "budget_stop",
]);

/** Terminal outcomes written to result.json. */
export const TerminalRunStatusSchema = z.enum([
  "ok",
  "failed",
  "cancelled",
  "budget_stop",
]);

/** status.json mid-run + terminal (includes cancel_requested progress). */
export const RunStatusSchema = z.enum([
  "ok",
  "failed",
  "cancelled",
  "budget_stop",
  "running",
  "queued",
  "cancel_requested",
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
  /**
   * Optional shared task-set folder under eval-skills/tasksets/<id>/.
   * When set, task fixtures (bug-01, …) live there; skill keeps only
   * fixtures/manifest.json + SKILL.md + scripts.
   */
  taskSetDir: SafeIdSchema.optional(),
  /** Canonical GitHub URL for the skill directory (tree or blob). */
  githubUrl: HttpsUrlSchema,
  /** Pinned source commit (Unikie Capture: repo + commit). */
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i, "git commit sha")
    .optional(),
  /** SPDX or short license label for the candidate package. */
  license: z.string().min(1).max(120).default("UNLICENSED"),
  /** Runtime / tooling dependencies declared for adoption review. */
  dependencies: z.array(z.string().min(1).max(120)).default([]),
  taskIds: z.array(z.string().min(1)).min(1),
  dryRunIds: z.array(z.string().min(1)).min(1),
  /** Basename only — safe for Docker TARGET_FILE env (no path/control chars). */
  targetFile: z.record(
    z
      .string()
      .min(1)
      .max(120)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9]+$/,
        "targetFile must be a simple filename",
      ),
  ),
});

export type SkillManifest = z.output<typeof SkillManifestSchema>;

/** Unikie role within a paired baseline↔candidate evaluation. */
export const EvalRoleSchema = z.enum(["baseline", "candidate"]);
export type EvalRole = z.output<typeof EvalRoleSchema>;

export const ScriptResultSchema = z.object({
  name: z.string(),
  exitCode: z.number(),
  summary: z.string(),
});

export const TokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
});

export type TokenUsage = z.output<typeof TokenUsageSchema>;

export const PerTaskResultSchema = z.object({
  taskId: z.string(),
  artifactRef: z.string().optional(),
  expectedRef: z.string().optional(),
  scriptResults: z.array(ScriptResultSchema),
  score: z.number().min(0).max(1).nullable(),
  status: TaskStatusSchema,
  /** Normalized edit distance vs expected (0 = identical); omit when N/A. */
  diffRatio: z.number().min(0).max(1).optional(),
  /** Aggregated produce tokens across repeats for this task (when available). */
  tokens: TokenUsageSchema.optional(),
});

/** Runtime env snapshot (Unikie Capture — no secrets). */
export const RunEnvSnapshotSchema = z.object({
  modelDryRun: z.string().optional(),
  modelOfficial: z.string().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  seed: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  costCapUsd: z.number().optional(),
  costHardStop: z.boolean().optional(),
  fakeProduce: z.boolean().optional(),
  allowHostGrade: z.boolean().optional(),
  grade: z.enum(["docker_script", "host_script"]).optional(),
  /** sha256 of the grade.js that actually runs (pinned harness for imports). */
  gradeHash: z.string().optional(),
  /**
   * Worker-only: true when produce used live model path (not FAKE_PRODUCE).
   * Official Comparison requires this — fixture JSON alone must not PASS.
   */
  produceAttested: z.boolean().optional(),
});

export type RunEnvSnapshot = z.output<typeof RunEnvSnapshotSchema>;

/** Capture block persisted on every run (Unikie Find/Capture). */
export const RunCaptureSchema = z.object({
  githubUrl: HttpsUrlSchema.optional(),
  commit: z.string().optional(),
  license: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  skillVersion: z.string(),
  role: EvalRoleSchema,
  /** sha256 of instruction prompt used for produce (baseline or SKILL.md). */
  promptHash: z.string().optional(),
  /** First ~500 chars of instruction for audit (not the full skill body). */
  promptPreview: z.string().max(600).optional(),
  /** baseline_neutral | skill_md */
  promptKind: z.enum(["baseline_neutral", "skill_md"]).optional(),
  env: RunEnvSnapshotSchema.optional(),
  capturedAt: z.string().optional(),
});

export type RunCapture = z.output<typeof RunCaptureSchema>;

export const RunResultSchema = z.object({
  runId: z.string(),
  evalSkillId: z.string(),
  evalSkillVersion: z.string(),
  /** GitHub URL of the skill at run time (from skill manifest). */
  evalSkillGithubUrl: HttpsUrlSchema.optional(),
  /** Unikie Capture metadata (repo, commit, license, deps, role). */
  capture: RunCaptureSchema.optional(),
  /** Shared id linking baseline + candidate runs. */
  evaluationId: SafeIdSchema.optional(),
  /**
   * Optional — do not default to "candidate". A missing role must not clobber
   * status.json baseline via syncStatusFromResult / listRuns.
   */
  role: EvalRoleSchema.optional(),
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
  /** Aggregated OpenAI token usage for the run. */
  tokens: TokenUsageSchema.optional(),
  status: TerminalRunStatusSchema,
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
  /**
   * baseline = neutral prompt; candidate = skill SKILL.md.
   * Optional — omit must not inject "candidate" (claim/retry resolve from status).
   */
  role: EvalRoleSchema.optional(),
  /** Links baseline and candidate jobs in one Unikie evaluation. */
  evaluationId: SafeIdSchema.optional(),
  /**
   * When set (retry), candidate produce uses SKILL.md from that run's
   * skill-snapshot/ instead of the live skill tree.
   */
  skillSnapshotFromRunId: SafeIdSchema.optional(),
  createdAt: z.string(),
});

export type JobManifest = z.output<typeof JobManifestSchema>;
