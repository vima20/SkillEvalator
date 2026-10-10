"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { statusBadgeClass } from "@/lib/status";

type PerTask = { taskId: string; score: number | null; status: string };

type Result = {
  score: number | null;
  modelId: string;
  evalSkillId: string;
  evalSkillVersion: string;
  evalSkillGithubUrl?: string;
  taskSetId: string;
  mode: string;
  perTask: PerTask[];
  costUsd?: number;
  latencyMs?: number;
  repeats?: number;
};

type StatusFile = {
  status?: string;
  repeat?: number;
  repeats?: number;
  costUsd?: number;
};

type Payload = {
  runId: string;
  status: StatusFile | null;
  result: Result | null;
};

const TERMINAL = new Set(["ok", "failed", "cancelled", "budget_stop"]);

export function RunDetailClient({
  runId,
  initial,
}: {
  runId: string;
  initial: Payload;
}) {
  const [data, setData] = useState(initial);
  const [polling, setPolling] = useState(
    !initial.result || !TERMINAL.has(initial.status?.status ?? ""),
  );
  const [jsonOpen, setJsonOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
      cache: "no-store",
    });
    if (res.status === 404) {
      setPolling(false);
      return;
    }
    if (!res.ok) return;
    const next = (await res.json()) as Payload;
    setData(next);
    const st = next.status?.status ?? "";
    if (next.result && (TERMINAL.has(st) || st === "")) setPolling(false);
  }, [runId]);

  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(id);
  }, [polling, refresh]);

  const status = data.status?.status ?? "unknown";
  const result = data.result;
  const repeat = data.status?.repeat;
  const repeats = data.status?.repeats ?? result?.repeats;
  const progress =
    status === "running" && repeat && repeats
      ? Math.min(100, Math.round((repeat / repeats) * 100))
      : status === "queued"
        ? 8
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
          <Link href="/runs">Runs</Link>
          <span aria-hidden="true"> / </span>
          <span>{runId}</span>
        </p>
        <h1>{runId}</h1>
        <p>
          {polling
            ? "Live updating while the worker processes this run."
            : "Run status, aggregate score, and per-task grades."}
        </p>
        {result && !polling ? (
          <p className="hint">
            <Link href={`/benefit/${runId}`}>Open Benefit Report →</Link>
          </p>
        ) : null}
      </header>

      <div className="meta-row">
        <span
          className={`${statusBadgeClass(status)}${polling ? " badge-live" : ""}`}
        >
          {status}
        </span>
        {result ? <span className="score">{result.score ?? "—"}</span> : null}
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

      {(polling || status === "running" || status === "queued") && (
        <div className="panel progress-panel">
          <div className="progress-head">
            <strong>
              {status === "queued" ? "Queued" : "Running"}
              {repeat && repeats ? ` · repeat ${repeat}/${repeats}` : ""}
            </strong>
            <span>{progress}%</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="hint">
            Refresh is automatic. You can leave this page open.
          </p>
        </div>
      )}

      {result ? (
        <>
          <div className="stat-strip">
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
          </div>

          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Score</th>
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
                      <span className={statusBadgeClass(t.status)}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.perTask.length === 0 ? (
              <p className="empty">No per-task results.</p>
            ) : null}
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setJsonOpen((v) => !v)}
          >
            {jsonOpen ? "Hide raw JSON" : "Show raw JSON"}
          </button>
          {jsonOpen ? (
            <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>
          ) : null}
        </>
      ) : (
        <div className="panel">
          <p className="empty">
            Waiting for worker to pick up this job…
            {polling ? "" : " Try refreshing."}
          </p>
        </div>
      )}
    </div>
  );
}
