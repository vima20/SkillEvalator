/**
 * Client-safe Settings types (no Node / preflight imports).
 * Keep server loaders in settingsSnapshot.ts.
 */

export type SettingsPreflightCheck = {
  ok: boolean;
  detail: string;
};

export type SettingsPreflightResult = {
  ok: boolean;
  fakeProduce: boolean;
  costCapUsd: number;
  checks: {
    openaiApiKey: SettingsPreflightCheck;
    docker: SettingsPreflightCheck;
    worker: SettingsPreflightCheck;
  };
  checkedAt: string;
};

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
  preflight: SettingsPreflightResult;
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
  /** Comparison / Benefit gates (code constants — not .env). */
  adoption: {
    officialMinRepeats: number;
    officialUseScoreFloor: number;
    softPassScoreFloor: number;
    liftPassDelta: number;
  };
  grade: {
    /** Live / official produce always grades in Docker. */
    livePolicy: "docker_script";
    /** Host grade only with FAKE_PRODUCE=known-good. */
    hostGradeOnlyWithFakeProduce: boolean;
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
  /** Repo identity for pilot archive labels (no secrets). */
  build: {
    /** Full git SHA when available; otherwise null. */
    gitSha: string | null;
    gitShaShort: string | null;
    /** True when `git status --porcelain` is non-empty. */
    dirty: boolean;
  };
  /** File-queue snapshot from data/jobs (for pilot ops). */
  queue: {
    queued: number;
    running: number;
    /** Active runId from live worker heartbeat when busy. */
    activeRunId: string | null;
  };
  web: {
    port: number;
    /** UI is intended for loopback-only bind (see start scripts). */
    bindHint: string;
  };
  checkedAt: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isPreflightCheck(v: unknown): boolean {
  return (
    isRecord(v) &&
    typeof v.ok === "boolean" &&
    typeof v.detail === "string"
  );
}

/** Narrow unknown API JSON before updating client state. */
export function isSettingsSnapshot(v: unknown): v is SettingsSnapshot {
  if (!isRecord(v)) return false;
  if (v.editableVia !== ".env") return false;
  if (typeof v.pilotReady !== "boolean") return false;
  if (!Array.isArray(v.pilotBlockers)) return false;
  if (typeof v.checkedAt !== "string" || !v.checkedAt) return false;
  if (!isRecord(v.preflight) || !isRecord(v.preflight.checks)) return false;
  const checks = v.preflight.checks;
  if (
    !isPreflightCheck(checks.openaiApiKey) ||
    !isPreflightCheck(checks.docker) ||
    !isPreflightCheck(checks.worker)
  ) {
    return false;
  }
  if (!isRecord(v.skills) || !Array.isArray(v.skills.rows)) return false;
  if (!isRecord(v.models) || !isRecord(v.adoption) || !isRecord(v.smoke)) {
    return false;
  }
  if (!isRecord(v.build) || !isRecord(v.queue)) return false;
  if (typeof v.queue.queued !== "number" || typeof v.queue.running !== "number") {
    return false;
  }
  return true;
}
