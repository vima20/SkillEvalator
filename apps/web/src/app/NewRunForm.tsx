"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { estimateRunCostUsd } from "@/lib/costEstimate";

/** Mirrored from @skillevalator/core OFFICIAL_MIN_REPEATS (API re-normalizes). */
const OFFICIAL_MIN_REPEATS = 3;
const MODEL_DRY_RUN = "gpt-4o-mini";
const MODEL_OFFICIAL = "gpt-4.1-mini";
/** Mirrors worker default COST_CAP_USD (env may override). */
const DEFAULT_COST_CAP_USD = 5;

export type SkillOption = {
  id: string;
  githubUrl: string;
  taskSetId: string;
  dryRunCount: number;
  taskCount: number;
};

type PreflightCheck = { ok: boolean; detail: string };

type Preflight = {
  ok: boolean;
  fakeProduce: boolean;
  checks: {
    openaiApiKey: PreflightCheck;
    docker: PreflightCheck;
    worker: PreflightCheck;
  };
};

export function NewRunForm({ skills }: { skills: SkillOption[] }) {
  const router = useRouter();
  const [evalSkillId, setEvalSkillId] = useState(
    skills[0]?.id ?? "code-debugging-eval",
  );
  const [mode, setMode] = useState<"dry-run" | "official">("dry-run");
  const [repeats, setRepeats] = useState(1);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const dryRunModeRef = useRef<HTMLButtonElement>(null);
  const officialModeRef = useRef<HTMLButtonElement>(null);

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
  const costPreview = useMemo(
    () =>
      estimateRunCostUsd({
        taskCount: taskCountPreview,
        repeats: safeRepeatsPreview,
        modelId: modelPreview,
      }),
    [taskCountPreview, safeRepeatsPreview, modelPreview],
  );

  const refreshPreflight = useCallback(async () => {
    setPreflightBusy(true);
    try {
      const res = await fetch("/api/preflight", { cache: "no-store" });
      if (!res.ok) {
        setPreflightError(`Preflight failed (HTTP ${res.status}).`);
        return;
      }
      setPreflightError(null);
      setPreflight((await res.json()) as Preflight);
    } catch {
      setPreflightError("Preflight network error — is the web server up?");
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

  function selectMode(next: "dry-run" | "official", focus = false) {
    setMode(next);
    if (next === "official") {
      setRepeats((r) => Math.max(r, OFFICIAL_MIN_REPEATS));
    }
    if (focus) {
      queue Promise.resolve().then(() => {
        (next === "official" ? officialModeRef : dryRunModeRef).current?.focus();
      });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preflight && !preflight.ok) {
      const ok = window.confirm(
        "Preflight is not green (API key, Docker, or worker). Queue this run anyway?",
      );
      if (!ok) return;
    }
    setBusy(true);
    setMsg("");
    setError(false);
    const safeRepeats =
      mode === "official"
        ? Math.max(repeatsSafe, OFFICIAL_MIN_REPEATS)
        : Math.max(1, repeatsSafe);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evalSkillId,
          mode,
          repeats: safeRepeats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setMsg(`Queued ${data.runId}`);
      router.push(`/runs/${data.runId}`);
    } catch (err) {
      setError(true);
      setMsg(err instanceof Error ? err.message : "error");
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
            <p className="hint">
              You can still queue a run, but it may stall or fail until these are
              green.
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
              </option>
            ))}
          </select>
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
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next =
                e.key === "ArrowRight"
                  ? mode === "dry-run"
                    ? "official"
                    : "dry-run"
                  : mode === "official"
                    ? "dry-run"
                    : "official";
              selectMode(next, true);
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
              onClick={() => selectMode("official")}
            >
              official
            </button>
          </div>
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

        <div
          className={`cost-estimate${costPreview.estimatedUsd > DEFAULT_COST_CAP_USD ? " cost-estimate-over" : ""}`}
          aria-live="polite"
        >
          <strong>Estimated cost</strong>
          <p>
            ~${costPreview.estimatedUsd.toFixed(4)} for {costPreview.calls}{" "}
            produce call
            {costPreview.calls === 1 ? "" : "s"} ({taskCountPreview} tasks ×{" "}
            {safeRepeatsPreview} repeats · <code>{modelPreview}</code>).
          </p>
          {costPreview.estimatedUsd > DEFAULT_COST_CAP_USD ? (
            <p className="form-error" role="status">
              Estimate exceeds the default ${DEFAULT_COST_CAP_USD} USD hard-stop
              — the worker may end with budget_stop before all tasks finish.
            </p>
          ) : (
            <p className="hint">
              Rough preview from typical token sizes — not a bill. Worker
              hard-stop defaults to ${DEFAULT_COST_CAP_USD} USD. Grade/Docker
              time is free.
            </p>
          )}
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Queueing…" : "Start run"}
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
