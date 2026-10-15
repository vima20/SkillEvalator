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
  web: {
    port: number;
    /** UI is intended for loopback-only bind (see start scripts). */
    bindHint: string;
  };
  checkedAt: string;
};
