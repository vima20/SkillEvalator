import path from "node:path";
import {
  DEFAULT_COST_CAP_USD,
  MODEL_DRY_RUN,
  MODEL_OFFICIAL,
  findRepoRoot,
  listSkills,
  resolveDataPaths,
  type SkillSummary,
} from "@skillevalator/core";
import { resolveWebAuthConfig } from "@/lib/webAuth";
import {
  runPreflight,
  type RunPreflightResult,
} from "@/lib/runPreflight";

/** Skill visible on Settings — read-only (edit on disk / re-import). */
export type SettingsSkillRow = {
  id: string;
  source: "eval-skills" | "imported";
  taskSetId: string;
  taskCount: number;
  dryRunCount: number;
  githubUrl: string;
  license: string;
  commit?: string;
};

export type SettingsSnapshot = {
  /** Read-only — edit root `.env` and restart web/worker. */
  editableVia: ".env";
  pilotReady: boolean;
  pilotBlockers: string[];
  preflight: RunPreflightResult;
  models: {
    dryRun: string;
    official: string;
  };
  decoding: {
    temperature: number;
    topP: number;
    seed: number;
    maxOutputTokens: number;
    openaiTimeoutMs: number;
  };
  cost: {
    costCapUsd: number;
    costHardStop: boolean;
  };
  auth: {
    webAuthEnabled: boolean;
    webAuthMisconfigured: boolean;
    officialRequiresWebAuth: boolean;
  };
  smoke: {
    fakeProduce: boolean;
    allowHostGrade: boolean;
    /** True when smoke flags would block or weaken official adoption. */
    blocksOfficial: boolean;
  };
  /** Skills on disk for New run — not editable here. */
  skills: {
    rows: SettingsSkillRow[];
    bundledCount: number;
    importedCount: number;
  };
  paths: {
    evalSkillsDir: string;
    importedSkillsDir: string;
    jobsDir: string;
    resultsDir: string;
  };
  web: {
    port: number;
  };
  checkedAt: string;
};

function num(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const v = env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function rel(root: string, abs: string): string {
  const r = path.relative(root, abs).split(path.sep).join("/");
  return r || ".";
}

/**
 * Read-only settings view for the Settings page / GET /api/settings.
 * Never includes secrets (API key / WEB_AUTH_TOKEN values).
 */
function toSkillRows(
  summaries: SkillSummary[],
  source: SettingsSkillRow["source"],
): SettingsSkillRow[] {
  return summaries.map((s) => ({
    id: s.id,
    source,
    taskSetId: s.taskSetId,
    taskCount: s.taskCount,
    dryRunCount: s.dryRunCount,
    githubUrl: s.githubUrl,
    license: s.license,
    ...(s.commit ? { commit: s.commit } : {}),
  }));
}

export function loadSettingsSnapshot(opts?: {
  env?: Record<string, string | undefined>;
  repoRoot?: string;
  preflight?: RunPreflightResult;
  /** Injected for unit tests (skip disk skill scan). */
  skills?: {
    bundled?: SkillSummary[];
    imported?: SkillSummary[];
  };
}): SettingsSnapshot {
  const env = opts?.env ?? process.env;
  const root =
    opts?.repoRoot ?? findRepoRoot(path.resolve(process.cwd()));
  const data = resolveDataPaths(root);
  const preflight =
    opts?.preflight ??
    runPreflight({
      env,
      repoRoot: root,
      jobsDir: data.jobsDir,
    });

  const bundled =
    opts?.skills?.bundled ?? listSkills(data.skillsDir);
  const importedIds = new Set(bundled.map((s) => s.id));
  const importedRaw =
    opts?.skills?.imported ?? listSkills(data.importedSkillsDir);
  // Prefer bundled id when the same skill id appears in both roots.
  const imported = importedRaw.filter((s) => !importedIds.has(s.id));
  const skillRows = [
    ...toSkillRows(bundled, "eval-skills"),
    ...toSkillRows(imported, "imported"),
  ].sort((a, b) => a.id.localeCompare(b.id));

  const webAuth = resolveWebAuthConfig(env.WEB_AUTH_TOKEN);
  const fakeProduce = env.FAKE_PRODUCE === "known-good";
  const allowHostGrade = env.ALLOW_HOST_GRADE === "1";
  const officialRequiresWebAuth = env.OFFICIAL_REQUIRES_WEB_AUTH === "true";

  const pilotBlockers: string[] = [];
  if (!preflight.checks.openaiApiKey.ok) {
    pilotBlockers.push("OPENAI_API_KEY missing (live produce)");
  }
  if (!preflight.checks.docker.ok) {
    pilotBlockers.push("Docker not reachable");
  }
  if (!preflight.checks.worker.ok) {
    pilotBlockers.push("Worker not alive");
  }
  if (fakeProduce) {
    pilotBlockers.push(
      "FAKE_PRODUCE=known-good — unset for official live pilot",
    );
  }
  if (webAuth.kind === "misconfigured") {
    pilotBlockers.push("WEB_AUTH_TOKEN misconfigured (empty/whitespace)");
  }
  if (officialRequiresWebAuth && webAuth.kind !== "required") {
    pilotBlockers.push(
      "OFFICIAL_REQUIRES_WEB_AUTH=true but WEB_AUTH_TOKEN is not set",
    );
  }

  const costCapRaw = num(env, "COST_CAP_USD", DEFAULT_COST_CAP_USD);
  const costCapUsd =
    Number.isFinite(costCapRaw) && costCapRaw > 0
      ? costCapRaw
      : DEFAULT_COST_CAP_USD;

  return {
    editableVia: ".env",
    pilotReady: pilotBlockers.length === 0,
    pilotBlockers,
    preflight,
    models: {
      dryRun: env.MODEL_DRY_RUN?.trim() || MODEL_DRY_RUN,
      official: env.MODEL_OFFICIAL?.trim() || MODEL_OFFICIAL,
    },
    decoding: {
      temperature: num(env, "MODEL_TEMPERATURE", 0),
      topP: num(env, "MODEL_TOP_P", 1),
      seed: num(env, "MODEL_SEED", 42),
      maxOutputTokens: num(env, "MODEL_MAX_OUTPUT_TOKENS", 4096),
      openaiTimeoutMs: num(env, "OPENAI_TIMEOUT_MS", 120_000),
    },
    cost: {
      costCapUsd,
      costHardStop: (env.COST_HARD_STOP ?? "true") !== "false",
    },
    auth: {
      webAuthEnabled: webAuth.kind === "required",
      webAuthMisconfigured: webAuth.kind === "misconfigured",
      officialRequiresWebAuth,
    },
    smoke: {
      fakeProduce,
      allowHostGrade,
      blocksOfficial: fakeProduce,
    },
    skills: {
      rows: skillRows,
      bundledCount: bundled.length,
      importedCount: imported.length,
    },
    paths: {
      evalSkillsDir: rel(root, data.skillsDir),
      importedSkillsDir: rel(root, data.importedSkillsDir),
      jobsDir: rel(root, data.jobsDir),
      resultsDir: rel(root, data.resultsDir),
    },
    web: {
      port: num(env, "WEB_PORT", 30001),
    },
    checkedAt: new Date().toISOString(),
  };
}
