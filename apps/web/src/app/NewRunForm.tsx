"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  estimateRunCostUsd,
  perLegEstimateExceedsCap,
} from "@skillevalator/core/costEstimate";
import { OFFICIAL_MIN_REPEATS } from "@skillevalator/core/job";
import {
  DEFAULT_COST_CAP_USD,
  MODEL_DRY_RUN,
  MODEL_OFFICIAL,
} from "@skillevalator/core/models";
import { apiFetch, UnauthorizedError } from "@/lib/apiFetch";
import { withPilotFocus } from "@/lib/pilotFocusHref";
import { formatRetryCostBlockedReason } from "@/lib/retryCostAdmissionCopy";
import {
  OFFICIAL_ADMISSION_PAIR_REQUIRED,
  resolveEnqueuePostError,
} from "@/lib/runLifecycle";
import { tryResolveAuthApiError } from "@/lib/authResolve";
import { resolvePreflightFetchError } from "@/lib/preflightSettingsResolve";
import { resolveSkillImportPostError } from "@/lib/skillImportResolve";

export type SkillOption = {
  id: string;
  githubUrl: string;
  taskSetId: string;
  dryRunCount: number;
  taskCount: number;
  commit?: string;
  license?: string;
  dependencies?: string[];
  wrappedFromAgentSkill?: boolean;
  agentWrapProfile?: "cde-v1" | "tge-v1";
};

type PreflightCheck = { ok: boolean; detail: string };

type Preflight = {
  ok: boolean;
  fakeProduce: boolean;
  /** Same Ready bar as Settings — blocks official enqueue when false. */
  pilotReady?: boolean;
  pilotBlockers?: string[];
  /** Worker COST_CAP_USD (from env / .env via preflight). */
  costCapUsd?: number;
  checks: {
    openaiApiKey: PreflightCheck;
    docker: PreflightCheck;
    worker: PreflightCheck;
  };
};

export function NewRunForm({
  skills: initialSkills,
  pilotFocus = false,
  /** Settings Ready CTA / ?mode=official — apply after first preflight. */
  preferOfficial = false,
}: {
  skills: SkillOption[];
  pilotFocus?: boolean;
  preferOfficial?: boolean;
}) {
  const router = useRouter();
  const [skills, setSkills] = useState(initialSkills);
  const [evalSkillId, setEvalSkillId] = useState(
    initialSkills[0]?.id ?? "code-debugging-eval",
  );
  const [mode, setMode] = useState<"dry-run" | "official">("dry-run");
  const [repeats, setRepeats] = useState(1);
  /** Unikie: baseline (neutral) + candidate (SKILL.md) paired evaluation. */
  const [withBaseline, setWithBaseline] = useState(true);
  const [importUrl, setImportUrl] = useState(
    "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
  );
  const [importZip, setImportZip] = useState<File | null>(null);
  const [importWrapProfile, setImportWrapProfile] = useState<
    "cde-v1" | "tge-v1"
  >("cde-v1");
  const [importBusy, setImportBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const dryRunModeRef = useRef<HTMLButtonElement>(null);
  const officialModeRef = useRef<HTMLButtonElement>(null);
  const preferOfficialApplied = useRef(false);
  /** One alert while ?mode=official waits for Ready (retry until applied). */
  const preferOfficialAlerted = useRef(false);

  const selected = skills.find((s) => s.id === evalSkillId) ?? skills[0];
  const minRepeats = mode === "official" ? OFFICIAL_MIN_REPEATS : 1;
  const repeatsSafe = Number.isFinite(repeats) ? repeats : minRepeats;
  const safeRepeatsPreview =
    mode === "official"
      ? Math.max(repeatsSafe, OFFICIAL_MIN_REPEATS)
      : Math.max(1, repeatsSafe);
  const taskCountPreview =
    mode === "official"
      ? (selected?.taskCount ?? 0)
      : (selected?.dryRunCount ?? 0);
  const modelPreview = mode === "official" ? MODEL_OFFICIAL : MODEL_DRY_RUN;
  const costCapUsd =
    typeof preflight?.costCapUsd === "number" &&
    Number.isFinite(preflight.costCapUsd) &&
    preflight.costCapUsd > 0
      ? preflight.costCapUsd
      : DEFAULT_COST_CAP_USD;
  const costPreview = useMemo(() => {
    const one = estimateRunCostUsd({
      taskCount: taskCountPreview,
      repeats: safeRepeatsPreview,
      modelId: modelPreview,
    });
    if (!withBaseline) return one;
    return {
      ...one,
      calls: one.calls * 2,
      estimatedUsd: Math.round(one.estimatedUsd * 2 * 10_000) / 10_000,
    };
  }, [taskCountPreview, safeRepeatsPreview, modelPreview, withBaseline]);

  const refreshPreflight = useCallback(async () => {
    setPreflightBusy(true);
    try {
      const res = await apiFetch("/api/preflight", { cache: "no-store" });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        setPreflightError(
          tryResolveAuthApiError(body) ??
            resolvePreflightFetchError("http", res.status),
        );
        return;
      }
      setPreflightError(null);
      setPreflight((await res.json()) as Preflight);
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setPreflightError(resolvePreflightFetchError("network"));
    } finally {
      setPreflightBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshPreflight();
    const id = window.setInterval(() => {
      void refreshPreflight();
    }, 8000);
    return () => window.clearInterval(id);
  }, [refreshPreflight]);

  const pilotReady = preflight?.pilotReady !== false;
  const pilotBlockers = preflight?.pilotBlockers ?? [];
  const officialBlocked =
    preflight == null ||
    Boolean(preflight.fakeProduce) ||
    preflight.pilotReady === false;
  /** Per-leg estimate vs COST_CAP_USD (paired preview doubles total spend). */
  const costOverCap = perLegEstimateExceedsCap({
    taskCount: taskCountPreview,
    repeats: safeRepeatsPreview,
    modelId: modelPreview,
    costCapUsd,
  });
  /** API POST /api/runs rejects every mode with 503 when preflight fails. */
  const canQueue =
    preflight?.ok === true && !preflightError && !costOverCap;

  function officialBlockedMessage(opts?: { apiRejects?: boolean }): string {
    const suffix = opts?.apiRejects ? " (API also rejects)" : "";
    return `Official mode blocked — Settings not Ready: ${
      pilotBlockers.join("; ") || "see Settings"
    }.${suffix}`;
  }

  // Preflight poll can flip Ready→blocked while Official is selected: demote
  // to dry-run with the same alert as selectMode (do not silently switch).
  // When ?mode=official, clear applied so Ready can re-select Official again
  // (manual dry-run while Ready leaves applied true — no force-back).
  useEffect(() => {
    if (officialBlocked && mode === "official") {
      setMode("dry-run");
      setError(true);
      setMsg(officialBlockedMessage());
      if (preferOfficial) {
        preferOfficialApplied.current = false;
      }
    }
  }, [officialBlocked, mode, pilotBlockers, preferOfficial]);

  function selectMode(next: "dry-run" | "official", focus = false) {
    if (next === "official" && officialBlocked) {
      setError(true);
      setMsg(officialBlockedMessage());
      return;
    }
    setMode(next);
    if (next === "official") {
      setRepeats((r) => Math.max(r, OFFICIAL_MIN_REPEATS));
      setWithBaseline(true);
      // Clear stale "Official mode blocked" after Ready / preferOfficial apply.
      setError(false);
      setMsg("");
    }
    if (focus) {
      void Promise.resolve().then(() => {
        (next === "official" ? officialModeRef : dryRunModeRef).current?.focus();
      });
    }
  }

  // Settings Ready CTA (?mode=official): wait for preflight so we do not
  // demote-with-alert while pilotReady is still unknown (preflight == null).
  // Only mark applied after a successful Official select — blocked first paint
  // must retry when Settings returns to Ready (URL still promises official).
  useEffect(() => {
    if (!preferOfficial || preferOfficialApplied.current) return;
    if (preflight == null) return;
    if (officialBlocked) {
      if (!preferOfficialAlerted.current) {
        preferOfficialAlerted.current = true;
        setError(true);
        setMsg(officialBlockedMessage());
      }
      return;
    }
    preferOfficialApplied.current = true;
    selectMode("official");
  }, [preferOfficial, preflight, officialBlocked, pilotBlockers]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canQueue) {
      setError(true);
      setMsg(
        costOverCap
          ? `Per-leg estimate exceeds the $${costCapUsd} USD hard-stop — lower repeats/tasks or raise COST_CAP_USD (worker may budget_stop).`
          : preflight == null || preflightBusy
            ? "Preflight still checking — wait for API key, Docker, and worker."
            : preflightError
              ? `Preflight error — ${preflightError}`
              : "Preflight not green — fix API key, Docker, or worker before queueing (API also rejects).",
      );
      return;
    }
    if (mode === "official" && officialBlocked) {
      setError(true);
      setMsg(officialBlockedMessage({ apiRejects: true }));
      return;
    }
    if (mode === "official" && !withBaseline) {
      setError(true);
      setMsg(OFFICIAL_ADMISSION_PAIR_REQUIRED);
      return;
    }
    setBusy(true);
    setMsg("");
    setError(false);
    const safeRepeats =
      mode === "official"
        ? Math.max(repeatsSafe, OFFICIAL_MIN_REPEATS)
        : Math.max(1, repeatsSafe);
    try {
      const res = await apiFetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evalSkillId,
          mode,
          repeats: safeRepeats,
          withBaseline,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        errorCode?: string;
        costCapUsd?: number;
        blockers?: string[];
        evaluationId?: string;
        runId?: string;
      };
      if (!res.ok) {
        setError(true);
        setMsg(
          tryResolveAuthApiError(data) ??
            resolveEnqueuePostError(data, formatRetryCostBlockedReason),
        );
        return;
      }
      if (withBaseline && data.evaluationId) {
        setMsg(`Queued evaluation ${data.evaluationId}`);
        router.push(
          withPilotFocus(`/comparison/${data.evaluationId}`, pilotFocus),
        );
      } else {
        setMsg(`Queued ${data.runId}`);
        router.push(withPilotFocus(`/runs/${data.runId}`, pilotFocus));
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) return;
      setError(true);
      setMsg(
        resolveEnqueuePostError(
          { errorCode: "enqueue_failed" },
          formatRetryCostBlockedReason,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const checks = preflight
    ? [
        { id: "key", label: "API key", ...preflight.checks.openaiApiKey },
        { id: "docker", label: "Docker", ...preflight.checks.docker },
        { id: "worker", label: "Worker", ...preflight.checks.worker },
      ]
    : [];

  return (
    <div className="split">
      <form className="panel form-grid" onSubmit={submit}>
        <div
          className={`preflight${preflight && !preflight.ok ? " preflight-warn" : ""}`}
          aria-live="polite"
        >
          <div className="preflight-head">
            <strong>Preflight</strong>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => void refreshPreflight()}
              disabled={preflightBusy}
            >
              {preflightBusy ? "Checking…" : "Refresh"}
            </button>
          </div>
          {preflightError ? (
            <p className="form-error" role="alert">
              {preflightError}
            </p>
          ) : preflight ? (
            <ul className="preflight-list">
              {checks.map((c) => (
                <li key={c.id} className={c.ok ? "is-ok" : "is-bad"}>
                  <span className="preflight-label">{c.label}</span>
                  <span className="preflight-detail">{c.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Checking Docker, API key, and worker…</p>
          )}
          {preflight && !preflight.ok ? (
            <p className="hint" role="status">
              Queue is blocked until API key, Docker, and worker are green (API
              returns 503 otherwise).{" "}
              <Link href={withPilotFocus("/settings", pilotFocus)}>
                Open Settings
              </Link>
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="evalSkillId">Eval skill</label>
          <select
            id="evalSkillId"
            value={evalSkillId}
            onChange={(e) => setEvalSkillId(e.target.value)}
          >
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
                {s.wrappedFromAgentSkill
                  ? ` (agent wrap · ${s.agentWrapProfile ?? s.taskSetId})`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="importUrl">Find / Receive (GitHub or local zip)</label>
          <input
            id="importUrl"
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/tree/ref/path"
          />
          <p className="hint">
            Import into <code>data/imported-skills</code> — GitHub URL or local{" "}
            <code>.zip</code>. Full eval package (<code>fixtures/manifest.json</code>)
            or plain <code>SKILL.md</code> (auto-wrapped — pick task family
            below). Layout:{" "}
            <a
              href="https://github.com/vima20/SkillEvalator/blob/main/docs/EVAL-SKILL-PACKAGE.md"
              target="_blank"
              rel="noreferrer"
            >
              eval-skill package guide
            </a>
            .
          </p>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="importWrapProfile">
              SKILL.md wrap task family (when no manifest)
            </label>
            <select
              id="importWrapProfile"
              value={importWrapProfile}
              disabled={importBusy}
              onChange={(e) =>
                setImportWrapProfile(
                  e.target.value === "tge-v1" ? "tge-v1" : "cde-v1",
                )
              }
            >
              <option value="cde-v1">
                cde-v1 — code debugging (shared eval-skills/tasksets)
              </option>
              <option value="tge-v1">
                tge-v1 — test generation (copies bundled fixtures)
              </option>
            </select>
          </div>
          <div className="action-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={importBusy || !importUrl.trim()}
              onClick={() => {
                void (async () => {
                  setImportBusy(true);
                  setMsg("");
                  setError(false);
                  try {
                    const res = await apiFetch("/api/skills", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        url: importUrl.trim(),
                        wrapProfile: importWrapProfile,
                      }),
                    });
                    const data = (await res.json()) as {
                      error?: string;
                      errorCode?: string;
                      skills?: SkillOption[];
                      allSkills?: SkillOption[];
                    };
                    if (!res.ok) {
                      setError(true);
                      setMsg(
                        tryResolveAuthApiError(data) ??
                          resolveSkillImportPostError(data),
                      );
                      return;
                    }
                    const next = data.allSkills ?? skills;
                    setSkills(next);
                    const first = data.skills?.[0]?.id;
                    if (first) setEvalSkillId(first);
                    const wrapped = data.skills?.some(
                      (s) => s.wrappedFromAgentSkill,
                    );
                    setMsg(
                      `Imported ${data.skills?.length ?? 0} skill(s) from GitHub` +
                        (wrapped
                          ? ` — SKILL.md wrapped on ${importWrapProfile}`
                          : ""),
                    );
                  } catch (err) {
                    if (err instanceof UnauthorizedError) return;
                    setError(true);
                    setMsg(
                      resolveSkillImportPostError({
                        errorCode: "skill_import_failed",
                      }),
                    );
                  } finally {
                    setImportBusy(false);
                  }
                })();
              }}
            >
              {importBusy ? "Importing…" : "Import from GitHub"}
            </button>
            <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
              Choose zip
              <input
                type="file"
                accept=".zip,application/zip"
                style={{ display: "none" }}
                disabled={importBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setImportZip(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={importBusy || !importZip}
              onClick={() => {
                if (!importZip) return;
                void (async () => {
                  setImportBusy(true);
                  setMsg("");
                  setError(false);
                  try {
                    const body = new FormData();
                    body.append("file", importZip, importZip.name);
                    body.append("wrapProfile", importWrapProfile);
                    const res = await apiFetch("/api/skills", {
                      method: "POST",
                      body,
                    });
                    const data = (await res.json()) as {
                      error?: string;
                      errorCode?: string;
                      skills?: SkillOption[];
                      allSkills?: SkillOption[];
                    };
                    if (!res.ok) {
                      setError(true);
                      setMsg(
                        tryResolveAuthApiError(data) ??
                          resolveSkillImportPostError(data),
                      );
                      return;
                    }
                    const next = data.allSkills ?? skills;
                    setSkills(next);
                    const first = data.skills?.[0]?.id;
                    if (first) setEvalSkillId(first);
                    const wrapped = data.skills?.some(
                      (s) => s.wrappedFromAgentSkill,
                    );
                    setMsg(
                      `Imported ${data.skills?.length ?? 0} skill(s) from ${importZip.name}` +
                        (wrapped
                          ? ` — SKILL.md wrapped on ${importWrapProfile}`
                          : ""),
                    );
                    setImportZip(null);
                  } catch (err) {
                    if (err instanceof UnauthorizedError) return;
                    setError(true);
                    setMsg(
                      resolveSkillImportPostError({
                        errorCode: "skill_import_failed",
                      }),
                    );
                  } finally {
                    setImportBusy(false);
                  }
                })();
              }}
            >
              {importBusy
                ? "Importing…"
                : importZip
                  ? `Import ${importZip.name}`
                  : "Import zip"}
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label" id="githubUrlLabel">
            Skill GitHub URL
          </span>
          {selected?.githubUrl ? (
            <a
              className="url-field"
              href={selected.githubUrl}
              target="_blank"
              rel="noreferrer"
              aria-labelledby="githubUrlLabel"
            >
              {selected.githubUrl}
            </a>
          ) : (
            <div
              className="url-field url-field-muted"
              aria-labelledby="githubUrlLabel"
            >
              No GitHub URL in skill manifest
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label" id="modeLabel">
            Mode
          </span>
          <div
            className="segmented"
            role="radiogroup"
            aria-labelledby="modeLabel"
            onKeyDown={(e) => {
              const key = e.key;
              if (key === "ArrowLeft" || key === "ArrowRight") {
                e.preventDefault();
                selectMode(mode === "dry-run" ? "official" : "dry-run", true);
                return;
              }
              if (key === "Home") {
                e.preventDefault();
                selectMode("dry-run", true);
                return;
              }
              if (key === "End") {
                e.preventDefault();
                selectMode("official", true);
                return;
              }
              if (key === " " || key === "Enter") {
                const target = e.target as HTMLElement | null;
                if (target?.getAttribute("role") !== "radio") return;
                e.preventDefault();
                const label = target.textContent?.trim();
                if (label === "dry-run" || label === "official") {
                  selectMode(label, true);
                }
              }
            }}
          >
            <button
              ref={dryRunModeRef}
              type="button"
              role="radio"
              aria-checked={mode === "dry-run"}
              tabIndex={mode === "dry-run" ? 0 : -1}
              className={mode === "dry-run" ? "is-active" : undefined}
              onClick={() => selectMode("dry-run")}
            >
              dry-run
            </button>
            <button
              ref={officialModeRef}
              type="button"
              role="radio"
              aria-checked={mode === "official"}
              tabIndex={mode === "official" ? 0 : -1}
              className={mode === "official" ? "is-active" : undefined}
              disabled={officialBlocked}
              title={
                officialBlocked
                  ? "Disabled until Settings Ready (same blockers as Settings)"
                  : undefined
              }
              onClick={() => selectMode("official")}
            >
              official
            </button>
          </div>
          {preflight && !pilotReady ? (
            <div className="hint">
              <p style={{ margin: "0 0 0.4rem" }}>
                Settings not Ready — official enqueue is blocked (dry-run still
                ok).{" "}
                <Link href={withPilotFocus("/settings", pilotFocus)}>
                  Open Settings
                </Link>
                {preflight.fakeProduce
                  ? " Unset FAKE_PRODUCE for a live pilot."
                  : ""}
              </p>
              {pilotBlockers.length > 0 ? (
                <ul className="settings-blockers" style={{ margin: 0 }}>
                  {pilotBlockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="repeats">Repeats</label>
          <input
            id="repeats"
            type="number"
            min={minRepeats}
            max={10}
            value={Number.isFinite(repeats) ? repeats : ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              setRepeats(Number.isFinite(n) ? n : Number.NaN);
            }}
          />
          {mode === "official" ? (
            <p className="hint">
              Official mode requires at least {OFFICIAL_MIN_REPEATS} repeats
              (enforced in UI and API).
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="check-row" htmlFor="withBaseline">
            <input
              id="withBaseline"
              type="checkbox"
              checked={withBaseline || mode === "official"}
              disabled={mode === "official"}
              title={
                mode === "official"
                  ? "Required for official — Benefit USE needs Comparison PASS"
                  : undefined
              }
              onChange={(e) => {
                if (mode === "official") return;
                setWithBaseline(e.target.checked);
              }}
            />
            <span>
              Unikie baseline↔candidate (neutral prompt + skill SKILL.md)
            </span>
          </label>
          <p className="hint">
            Queues two runs with one evaluationId and opens Comparison. Baseline
            does not use the skill SKILL.md.
            {mode === "official"
              ? " Official always uses the pair (single-leg blocked)."
              : ""}
          </p>
        </div>

        <div
          className={`cost-estimate${
            costOverCap ? " cost-estimate-over" : ""
          }`}
          aria-live="polite"
        >
          <strong>Estimated cost</strong>
          <p>
            ~${costPreview.estimatedUsd.toFixed(4)} for {costPreview.calls}{" "}
            produce call
            {costPreview.calls === 1 ? "" : "s"} ({taskCountPreview} tasks ×{" "}
            {safeRepeatsPreview} repeats · <code>{modelPreview}</code>
            {withBaseline ? " · ×2 baseline+candidate" : ""}).
          </p>
          {costOverCap ? (
            <p className="form-error" role="status">
              Per-leg estimate exceeds the ${costCapUsd} USD hard-stop
              {withBaseline
                ? ` (each baseline/candidate leg caps separately — paired spend can reach ~$${
                    costCapUsd * 2
                  })`
                : ""}{" "}
              — the worker may end with budget_stop before all tasks finish.
            </p>
          ) : (
            <p className="hint">
              Rough preview assuming large SKILL.md + subject prompts — not a
              bill; real usage can still be higher. Each run hard-stops at $
              {costCapUsd}
              {withBaseline
                ? ` (paired ≈ up to $${costCapUsd * 2} across both legs)`
                : ""}{" "}
              (from COST_CAP_USD). Grade/Docker time is free.
            </p>
          )}
        </div>

        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || !canQueue}
          title={
            canQueue
              ? undefined
              : costOverCap
                ? `Per-leg estimate exceeds $${costCapUsd} COST_CAP_USD hard-stop`
                : "Blocked until preflight is green (API key, Docker, worker)"
          }
        >
          {busy
            ? "Queueing…"
            : costOverCap
              ? "Over cost cap"
              : !canQueue
                ? "Preflight required"
                : withBaseline
                  ? "Start baseline↔candidate"
                  : "Start run"}
        </button>
        {msg ? (
          <p
            className={`msg${error ? " error" : ""}`}
            role={error ? "alert" : "status"}
            aria-live="polite"
          >
            {msg}
          </p>
        ) : null}
      </form>

      <aside className="panel skill-card">
        <p className="eyebrow">Selected skill</p>
        <h2>{selected?.id ?? evalSkillId}</h2>
        <p className="skill-card-body">
          Pipeline: model produce → Docker/host grade (script vs fixtures /
          subject).
        </p>
        <dl className="meta-list">
          <div>
            <dt>Task set</dt>
            <dd>
              <code>{selected?.taskSetId ?? "—"}</code>
            </dd>
          </div>
          <div>
            <dt>Dry-run tasks</dt>
            <dd>{selected?.dryRunCount ?? "—"}</dd>
          </div>
          <div>
            <dt>Official tasks</dt>
            <dd>{selected?.taskCount ?? "—"}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>
              <code>
                {selected?.commit ? selected.commit.slice(0, 12) : "—"}
              </code>
            </dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>{selected?.license ?? "—"}</dd>
          </div>
        </dl>
        {selected?.githubUrl ? (
          <a
            className="btn btn-ghost"
            href={selected.githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open on GitHub
          </a>
        ) : null}
      </aside>
    </div>
  );
}
