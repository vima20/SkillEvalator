"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { statusBadgeClass } from "@/lib/status";

type PerTask = {
  taskId: string;
  score: number | null;
  status: string;
  diffRatio?: number;
};

type Result = {
  score: number | null;
  modelId: string;
  evalSkillId: string;
  evalSkillVersion: string;
  evalSkillGithubUrl?: string;
  taskSetId: string;
  mode: string;
  role?: string;
  evaluationId?: string;
  perTask: PerTask[];
  costUsd?: number;
  latencyMs?: number;
  repeats?: number;
  findings?: string[];
  status?: string;
  tokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  capture?: {
    githubUrl?: string;
    promptHash?: string;
    promptKind?: string;
    promptPreview?: string;
    commit?: string;
    license?: string;
    dependencies?: string[];
    skillVersion?: string;
    env?: {
      temperature?: number;
      seed?: number;
      costCapUsd?: number;
      grade?: string;
      fakeProduce?: boolean;
    };
  };
};

type StatusFile = {
  status?: string;
  repeat?: number;
  repeats?: number;
  costUsd?: number;
  error?: string;
  errorCode?: string;
};

type Payload = {
  runId: string;
  status: StatusFile | null;
  result: Result | null;
};

const TERMINAL = new Set(["ok", "failed", "cancelled", "budget_stop"]);

function shouldPoll(status: string | undefined, hasResult: boolean): boolean {
  if (hasResult) return false;
  // Mid-loop budget_stop is written before result.json — keep polling.
  if (status === "budget_stop") return true;
  return !TERMINAL.has(status ?? "");
}

function RetryActions({
  canRetry,
  retrying,
  retryError,
  blockedReason,
  onRetry,
}: {
  canRetry: boolean;
  retrying: boolean;
  retryError: string | null;
  blockedReason?: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="action-row progress-actions" style={{ marginTop: 14 }}>
      <p className="hint" id="retry-hint">
        {blockedReason ??
          "Queues a new run with the same skill, mode, and repeats."}
      </p>
      <button
        type="button"
        className="btn btn-primary btn-compact"
        disabled={!canRetry}
        aria-describedby="retry-hint"
        onClick={onRetry}
      >
        {retrying ? "Retrying…" : "Retry run"}
      </button>
      {retryError ? (
        <p className="form-error" role="alert">
          {retryError}
        </p>
      ) : null}
    </div>
  );
}

export function RunDetailClient({
  runId,
  initial,
}: {
  runId: string;
  initial: Payload;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [polling, setPolling] = useState(
    shouldPoll(initial.status?.status, !!initial.result),
  );
  const [pollError, setPollError] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setPolling(false);
        setPollError("Run not found.");
        return;
      }
      if (res.status === 401) {
        setPolling(false);
        setPollError("Unauthorized — unlock with WEB_AUTH_TOKEN, then refresh.");
        return;
      }
      if (!res.ok) {
        setPolling(false);
        setPollError(`Could not refresh run status (HTTP ${res.status}).`);
        return;
      }
      setPollError(null);
      const next = (await res.json()) as Payload;
      setData(next);
      if (!shouldPoll(next.status?.status, !!next.result)) {
        setPolling(false);
        setCancelling(false);
      } else {
        setPolling(true);
      }
    } catch {
      setPolling(false);
      setPollError("Network error while refreshing run status.");
    }
  }, [runId]);

  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(id);
  }, [polling, refresh]);

  // budget_stop without result should not poll forever (orphan / crashed worker).
  useEffect(() => {
    const st = data.status?.status;
    if (st !== "budget_stop" || data.result) return;
    const id = window.setTimeout(() => {
      setPolling(false);
    }, 90_000);
    return () => window.clearTimeout(id);
  }, [data.status?.status, data.result]);

  const status = data.status?.status ?? "unknown";
  const result = data.result;
  const cancelRequested = status === "cancel_requested";
  const budgetStopping = status === "budget_stop" && !result && polling;
  // Wind-down budget_stop (no result yet) is cancellable so Retry is not stuck.
  const canCancel =
    (status === "queued" || status === "running" || budgetStopping) &&
    !cancelling &&
    !cancelRequested &&
    !pollError;
  const quotaBlocked = data.status?.errorCode === "insufficient_quota";
  // Match API: budget_stop is retryable even before result.json (job fallback).
  const canRetry =
    (status === "failed" ||
      status === "cancelled" ||
      status === "budget_stop") &&
    !quotaBlocked &&
    !retrying &&
    !budgetStopping;

  async function onRetry() {
    if (!canRetry) return;
    setRetryError(null);
    setRetrying(true);
    try {
      const res = await fetch(
        `/api/runs/${encodeURIComponent(runId)}/retry`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        runId?: string;
      };
      if (!res.ok || !body.runId) {
        setRetryError(body.error ?? "Retry failed");
        setRetrying(false);
        return;
      }
      router.push(`/runs/${body.runId}`);
    } catch {
      setRetryError("Retry failed");
      setRetrying(false);
    }
  }

  async function onCancel() {
    if (!canCancel) return;
    setCancelError(null);
    setCancelling(true);
    try {
      const res = await fetch(
        `/api/runs/${encodeURIComponent(runId)}/cancel`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };
      if (!res.ok) {
        setCancelError(body.error ?? "Cancel failed");
        setCancelling(false);
        return;
      }
      setPolling(true);
      await refresh();
    } catch {
      setCancelError("Cancel failed");
      setCancelling(false);
    }
  }

  async function onManualRefresh() {
    setRefreshBusy(true);
    setPollError(null);
    await refresh();
    setRefreshBusy(false);
  }

  const repeat = data.status?.repeat;
  const repeats = data.status?.repeats ?? result?.repeats;
  const isQueued = status === "queued";
  const progress =
    status === "running" && repeat && repeats
      ? Math.min(100, Math.round((repeat / repeats) * 100))
      : result
        ? 100
        : 0;

  const passed =
    result?.perTask.filter((t) => t.status === "ok").length ?? 0;
  const total = result?.perTask.length ?? 0;

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">
          <Link href="/runs">Unikie · Runs</Link>
          <span aria-hidden="true"> / </span>
          <span>{runId}</span>
        </p>
        <h1 className="run-title">
          {result ? (
            <>
              {result.evalSkillId}
              {result.role ? (
                <>
                  {" "}
                  <span className={`role-chip role-${result.role}`}>
                    {result.role}
                  </span>
                </>
              ) : null}
            </>
          ) : (
            runId
          )}
        </h1>
        {result ? (
          <p className="run-subtitle">
            <code>{runId}</code> · {result.mode}
            {result.evaluationId ? (
              <>
                {" "}
                ·{" "}
                <Link href={`/comparison/${result.evaluationId}`}>
                  Comparison
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        <p>
          {pollError
            ? "Live updates paused."
            : polling
              ? "Live updating while the worker processes this run."
              : "Run status, aggregate score, and per-task grades."}
        </p>
        <div className="action-row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            disabled={refreshBusy}
            onClick={() => void onManualRefresh()}
          >
            {refreshBusy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {result && !polling ? (
          <p className="hint">
            {(result.role ?? "candidate") === "baseline" ? (
              result.evaluationId ? (
                <Link href={`/comparison/${result.evaluationId}`}>
                  Open paired Comparison →
                </Link>
              ) : (
                "Baseline leg — use Comparison for PASS/FAIL (no skill Benefit)."
              )
            ) : (
              <Link href={`/benefit/${runId}`}>Open Benefit Report →</Link>
            )}
          </p>
        ) : null}
      </header>

      {pollError ? (
        <p className="form-error" role="alert">
          {pollError}
        </p>
      ) : null}

      <div className="meta-row">
        <span
          className={`${statusBadgeClass(status)}${polling && !pollError ? " badge-live" : ""}`}
        >
          {status}
        </span>
        {result ? (
          <span className="score" title="Aggregate score">
            <span className="stat-label">Score </span>
            {result.score ?? "—"}
          </span>
        ) : null}
        {result ? (
          <>
            <span>
              Model <code>{result.modelId}</code>
            </span>
            <span>
              Skill <code>{result.evalSkillId}</code>{" "}
              <code>{result.evalSkillVersion}</code>
            </span>
            <span>
              Task set <code>{result.taskSetId}</code>
            </span>
            {result.evalSkillGithubUrl ? (
              <span>
                GitHub{" "}
                <a
                  href={result.evalSkillGithubUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  open skill
                </a>
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {(status === "running" ||
        status === "queued" ||
        cancelRequested ||
        budgetStopping) &&
        !pollError && (
        <div className="panel progress-panel">
          <div className="progress-head">
            <strong>
              {cancelRequested
                ? "Cancel requested — stopping worker"
                : budgetStopping
                  ? "Cost cap reached — finishing"
                  : isQueued
                    ? "Queued — waiting for worker"
                    : "Running"}
              {!isQueued &&
              !cancelRequested &&
              !budgetStopping &&
              repeat &&
              repeats
                ? ` · repeat ${repeat}/${repeats}`
                : ""}
            </strong>
            <span>
              {isQueued || cancelRequested || budgetStopping
                ? "…"
                : `${progress}%`}
            </span>
          </div>
          <div
            className={`progress-track${isQueued || cancelRequested || budgetStopping ? " is-indeterminate" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              isQueued || cancelRequested || budgetStopping
                ? undefined
                : progress
            }
            aria-busy={
              isQueued || cancelRequested || budgetStopping || undefined
            }
            aria-label={
              cancelRequested
                ? "Cancel requested"
                : budgetStopping
                  ? "Cost cap reached, finishing"
                  : isQueued
                    ? "Queued, waiting for worker"
                    : "Run progress"
            }
          >
            <div
              className="progress-fill"
              style={
                isQueued || cancelRequested || budgetStopping
                  ? undefined
                  : { width: `${progress}%` }
              }
            />
          </div>
          <div className="action-row progress-actions">
            <p className="hint">
              {cancelling || cancelRequested
                ? "Cancel requested — waiting for the worker to stop."
                : budgetStopping
                  ? "Cost hard-stop hit — writing final result (no further produce/grade)."
                  : "Refresh is automatic. You can leave this page open."}
            </p>
            <button
              type="button"
              className="btn btn-danger btn-compact"
              disabled={!canCancel}
              onClick={() => void onCancel()}
            >
              {cancelling ? "Cancelling…" : "Cancel run"}
            </button>
          </div>
          {cancelError ? (
            <p className="form-error" role="alert">
              {cancelError}
            </p>
          ) : null}
        </div>
      )}

      {result ? (
        <>
          <div className="stat-strip stat-strip-5">
            <div className="stat">
              <span className="stat-label">Tasks passed</span>
              <span className="stat-value">
                {passed}/{total}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Mode</span>
              <span className="stat-value">{result.mode}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Cost</span>
              <span className="stat-value">
                ${((result.costUsd ?? 0) as number).toFixed(4)}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Latency</span>
              <span className="stat-value">
                {Math.round((result.latencyMs ?? 0) / 1000)}s
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Tokens</span>
              <span className="stat-value">
                {result.tokens?.totalTokens ?? "—"}
              </span>
            </div>
          </div>

          {result.findings && result.findings.length > 0 ? (
            <div className="panel findings-panel">
              <h2 className="findings-title">Findings</h2>
              <ul className="findings-list">
                {result.findings.map((f, i) => (
                  <li key={`${i}-${f}`}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel">
            {result.perTask.length === 0 ? (
              <p className="empty">No per-task results.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Score</th>
                      <th>Diff</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.perTask.map((t) => (
                      <tr key={t.taskId}>
                        <td>
                          <code>{t.taskId}</code>
                        </td>
                        <td>{t.score}</td>
                        <td>
                          {typeof t.diffRatio === "number"
                            ? `${(t.diffRatio * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td>
                          <span className={statusBadgeClass(t.status)}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="action-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <a
              className="btn btn-ghost"
              href={`/api/runs/${encodeURIComponent(runId)}/csv`}
            >
              Download CSV
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setJsonOpen((v) => !v)}
            >
              {jsonOpen ? "Hide raw JSON" : "Show raw JSON"}
            </button>
            {result.evaluationId ? (
              <Link
                className="btn btn-ghost"
                href={`/comparison/${result.evaluationId}`}
              >
                Comparison
              </Link>
            ) : null}
          </div>
          {result.tokens ? (
            <p className="hint">
              Tokens in {result.tokens.promptTokens} / out{" "}
              {result.tokens.completionTokens}
              {result.role ? ` · role ${result.role}` : null}.
            </p>
          ) : null}
          {result.capture ? (
            <div className="panel" style={{ marginTop: 14 }}>
              <h2>Capture</h2>
              <dl className="meta-list">
                <div>
                  <dt>GitHub</dt>
                  <dd>
                    {result.capture.githubUrl ? (
                      <a
                        href={result.capture.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {result.capture.githubUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Commit</dt>
                  <dd>
                    <code>{result.capture.commit ?? "—"}</code>
                  </dd>
                </div>
                <div>
                  <dt>License</dt>
                  <dd>{result.capture.license ?? "—"}</dd>
                </div>
                <div>
                  <dt>Dependencies</dt>
                  <dd>
                    {result.capture.dependencies?.length
                      ? result.capture.dependencies.join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Skill version</dt>
                  <dd>
                    <code>{result.capture.skillVersion ?? "—"}</code>
                  </dd>
                </div>
                <div>
                  <dt>Prompt</dt>
                  <dd>
                    <code>{result.capture.promptKind ?? "—"}</code> · hash{" "}
                    <code>{result.capture.promptHash ?? "—"}</code>
                  </dd>
                </div>
                {result.capture.env ? (
                  <div>
                    <dt>Env snapshot</dt>
                    <dd>
                      temp={result.capture.env.temperature}, seed=
                      {result.capture.env.seed}, cap=$
                      {result.capture.env.costCapUsd}, grade=
                      {result.capture.env.grade ?? "—"}
                      {result.capture.env.fakeProduce
                        ? ", FAKE_PRODUCE"
                        : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {result.capture.promptPreview ? (
                <pre className="json-block" style={{ marginTop: 12 }}>
                  {result.capture.promptPreview}
                </pre>
              ) : null}
              <p className="hint" style={{ marginTop: 10 }}>
                Immutable <code>skill-snapshot/</code> is on disk under this
                run’s results folder (SKILL.md + manifest). Retry locks candidate
                SKILL.md from that snapshot when present.
              </p>
            </div>
          ) : null}
          {jsonOpen ? (
            <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>
          ) : null}
          {status === "failed" ||
          status === "cancelled" ||
          status === "budget_stop" ||
          canRetry ? (
            <RetryActions
              canRetry={canRetry}
              retrying={retrying}
              retryError={retryError}
              blockedReason={
                quotaBlocked
                  ? "Retry blocked: no OpenAI credits. Add billing credits first."
                  : null
              }
              onRetry={() => void onRetry()}
            />
          ) : null}
        </>
      ) : status === "cancelled" ? (
        <div className="panel">
          <p className="empty">
            Run cancelled before a scorecard was produced.
          </p>
          <RetryActions
            canRetry={canRetry}
            retrying={retrying}
            retryError={retryError}
            onRetry={() => void onRetry()}
          />
        </div>
      ) : status === "failed" ? (
        <div className="panel">
          <p className="empty">
            Run failed before a scorecard was produced.
          </p>
          {quotaBlocked ? (
            <p className="form-error credit-alert" role="alert">
              No OpenAI credits remaining. Add billing credits before retrying.
              Retry is blocked until credits are available.
            </p>
          ) : null}
          {data.status?.error ? (
            <p className="form-error" role="alert">
              {data.status.errorCode ? (
                <>
                  <code>{data.status.errorCode}</code>
                  {" — "}
                </>
              ) : null}
              {data.status.error}
            </p>
          ) : (
            <p className="hint">
              No error detail was recorded. Check the worker log (common:
              OpenAI credits / HTTP 429, or Docker grade failures).
            </p>
          )}
          <RetryActions
            canRetry={canRetry}
            retrying={retrying}
            retryError={retryError}
            blockedReason={
              quotaBlocked
                ? "Retry blocked: no OpenAI credits. Add billing credits first."
                : null
            }
            onRetry={() => void onRetry()}
          />
        </div>
      ) : status === "budget_stop" && !result && !polling ? (
        <div className="panel">
          <p className="empty">Run stopped by cost budget before completion.</p>
          <RetryActions
            canRetry={canRetry}
            retrying={retrying}
            retryError={retryError}
            onRetry={() => void onRetry()}
          />
        </div>
      ) : (
        <div className="panel">
          <p className="empty">
            Waiting for worker to pick up this job…
            {pollError
              ? " Live updates paused — use Refresh."
              : polling
                ? ""
                : " Use Refresh to check again."}
          </p>
        </div>
      )}
    </div>
  );
}
