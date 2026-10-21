"use client";

import {
  listScorecardTaskIds,
  taskScorecardCoverageIssues,
  taskScorecardPassCounts,
} from "@skillevalator/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ComparisonHarnessCallouts } from "@/components/ComparisonHarnessCallouts";
import { ExportDownloadButton } from "@/components/ExportDownloadButton";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import {
  formatCaptureEnvEvidence,
  formatCaptureEnvSnapshot,
  formatCaptureGradePolicy,
} from "@/lib/captureEnvEvidence";
import { apiFetch, UnauthorizedError } from "@/lib/apiFetch";
import { tryResolveAuthApiError } from "@/lib/authResolve";
import { withPilotFocus } from "@/lib/pilotFocusHref";
import { EXPORT_RUN_CSV_LOCKED_FALLBACK } from "@/lib/exportResolve";
import { formatRetryCostBlockedReason } from "@/lib/retryCostAdmissionCopy";
import { benefitPairCtaLabel } from "@/lib/benefitListHints";
import { benefitCtaHint } from "@/lib/runDetailHints";
import {
  resolveRunDetailGetError,
  resolveRunDetailHttpError,
} from "@/lib/runDetailResolve";
import {
  isRetryBillingBlocked,
  isRetryBudgetStopping,
  pairedCancelAlsoCopy,
  parseAlsoCancelledRunId,
  resolveCancelPostError,
  RETRY_INSUFFICIENT_QUOTA_BLOCKED,
  RETRY_STILL_FINISHING_ERROR,
  resolveRetryPostError,
  runDetailCanCancel,
  runDetailFinalizeOrphansPath,
  runDetailShouldPoll,
  WIND_DOWN_ORPHAN_MS,
} from "@/lib/runLifecycle";
import {
  isOrphanActiveWindDown,
  orphanStuckFromFinalizePayload,
  statusBadgeClass,
} from "@/lib/status";

function AlsoCancelledHint({
  alsoRunId,
  pilotFocus,
}: {
  alsoRunId: string;
  pilotFocus: boolean;
}) {
  return (
    <p
      className="hint"
      role="status"
      style={{ marginTop: 10 }}
      aria-label={pairedCancelAlsoCopy(alsoRunId)}
    >
      Also cancelled the paired sibling{" "}
      <Link href={withPilotFocus(`/runs/${alsoRunId}`, pilotFocus)}>
        {alsoRunId}
      </Link>
      .
    </p>
  );
}

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
      allowHostGrade?: boolean;
      fakeProduce?: boolean;
      produceAttested?: boolean;
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
  evaluationId?: string;
};

type Payload = {
  runId: string;
  status: StatusFile | null;
  result: Result | null;
  /** Same bar as CSV API gate (official + decisive Comparison + meta leg). */
  csvExportAllowed?: boolean;
  /** Same string as API 409 when CSV is locked. */
  csvExportBlockReason?: string | null;
  /** status → job → result (same as pairHarness / retryAdmission). */
  resolvedEvaluationId?: string | null;
  /** Healed Comparison tip (comparison ?? meta) for Benefit CTA demotion. */
  tipCandidateRunId?: string | null;
  /** Sibling tip evidence for harness callouts + Benefit CTA demotion. */
  pairHarness?: {
    metaSmoke: boolean;
    baselineFakeProduce: boolean;
    candidateFakeProduce: boolean;
    baselineProduceAttested: boolean;
    candidateProduceAttested: boolean;
    baselineRunId: string;
    candidateRunId: string;
  } | null;
  /** Same waiting/unavailable gate as Benefit detail / Comparison list. */
  pairPending?: "waiting" | "unavailable";
  /**
   * Tip siblings in budget_stop / cancel_requested without result while
   * pairPending=waiting — finalize after shared orphan timeout (Benefit parity).
   */
  pairWindDownRunIds?: string[];
  /** Job file still on disk (finalize heal noop while worker finishing). */
  hasLiveJob?: boolean;
  /** Full POST /retry admission mirror (preflight, Ready, pair, cost, snapshot). */
  retryAdmission?: {
    canRetry: boolean;
    blockedReason: string | null;
  } | null;
};

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
  pilotFocus = false,
}: {
  runId: string;
  initial: Payload;
  pilotFocus?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [polling, setPolling] = useState(
    runDetailShouldPoll({
      status: initial.status?.status,
      hasResult: !!initial.result,
      pairPending: initial.pairPending,
    }),
  );
  const [pollError, setPollError] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  /** Paired sibling cancelled by POST /cancel cascade (`alsoCancelled`). */
  const [cancelAlsoRunId, setCancelAlsoRunId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [finalizeGen, setFinalizeGen] = useState(0);
  const [pairFinalizeGen, setPairFinalizeGen] = useState(0);
  const [pairOrphanStuck, setPairOrphanStuck] = useState(false);
  const pairWindDownKey = [...new Set(data.pairWindDownRunIds ?? [])]
    .sort()
    .join("\0");

  const refresh = useCallback(
    async (opts?: { finalizeOrphans?: boolean }): Promise<Payload | null> => {
      try {
        const path = opts?.finalizeOrphans
          ? runDetailFinalizeOrphansPath(runId)
          : `/api/runs/${encodeURIComponent(runId)}`;
        const res = await apiFetch(path, { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            errorCode?: string;
            misconfigured?: boolean;
          };
          setPolling(false);
          setPollError(
            tryResolveAuthApiError(body) ??
              resolveRunDetailGetError(
                body.errorCode || body.error
                  ? body
                  : {
                      errorCode:
                        res.status === 404
                          ? "run_detail_not_found"
                          : "run_detail_failed",
                    },
                resolveRunDetailHttpError(res.status),
              ),
          );
          return null;
        }
        setPollError(null);
        const next = (await res.json()) as Payload;
        setData(next);
        if (
          !runDetailShouldPoll({
            status: next.status?.status,
            hasResult: !!next.result,
            pairPending: next.pairPending,
          })
        ) {
          setPolling(false);
          setCancelling(false);
        } else {
          setPolling(true);
        }
        return next;
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          setPolling(false);
          return null;
        }
        setPolling(false);
        setPollError(
          resolveRunDetailGetError({ errorCode: "run_detail_failed" }),
        );
        return null;
      }
    },
    [runId],
  );

  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(id);
  }, [polling, refresh]);

  // budget_stop / cancel_requested without result: finalize after 90s.
  // Live job (heal noop) or failed GET re-arms — same as RunsAutoRefresh.
  useEffect(() => {
    const st = data.status?.status;
    if (data.result) return;
    if (st !== "budget_stop" && st !== "cancel_requested") return;
    const id = window.setTimeout(() => {
      void (async () => {
        const next = await refresh({ finalizeOrphans: true });
        if (
          !next ||
          (isOrphanActiveWindDown(next.status?.status, Boolean(next.result)) &&
            next.hasLiveJob === true)
        ) {
          setFinalizeGen((g) => g + 1);
        }
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(id);
  }, [data.status?.status, data.result, refresh, finalizeGen]);

  // pairPending=waiting + sibling wind-down: finalize tip legs (Benefit parity).
  // This run may already have result.json so the self-finalize effect above skips.
  // Aggregate stuck across siblings — avoid per-id setPairOrphanStuck races.
  useEffect(() => {
    if (data.pairPending !== "waiting" || !pairWindDownKey) {
      setPairOrphanStuck(false);
      return;
    }
    const ids = pairWindDownKey.split("\0").filter(Boolean);
    const timer = window.setTimeout(() => {
      void (async () => {
        let stillStuck = false;
        let rearm = false;
        await Promise.all(
          ids.map(async (siblingId) => {
            let stuck = true;
            try {
              const res = await apiFetch(
                runDetailFinalizeOrphansPath(siblingId),
                { cache: "no-store" },
              );
              const body = (await res.json().catch(() => ({}))) as {
                status?: { status?: string } | null;
                result?: unknown | null;
                hasLiveJob?: boolean;
              };
              stuck = orphanStuckFromFinalizePayload(body);
            } catch {
              /* treat as stuck */
            }
            if (stuck) stillStuck = true;
            else rearm = true;
          }),
        );
        setPairOrphanStuck(stillStuck);
        await refresh();
        if (rearm) setPairFinalizeGen((g) => g + 1);
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(timer);
  }, [data.pairPending, pairWindDownKey, refresh, pairFinalizeGen]);

  const status = data.status?.status ?? "unknown";
  const result = data.result;
  const resolvedEvaluationId =
    data.resolvedEvaluationId ?? result?.evaluationId ?? null;
  const cancelRequested = status === "cancel_requested";
  /** Orphan/settling cost-cap — same as POST retry admission + cancelGate. */
  const budgetStopWindDown = isRetryBudgetStopping(status, Boolean(result));
  /**
   * Live cost-cap wind-down: job file still on disk writing result.json.
   * Do not key off `polling` — a failed GET must not flip copy to
   * "Worker may be gone" / Cancel while the worker is still finishing.
   */
  const budgetStoppingLive =
    budgetStopWindDown && data.hasLiveJob === true;
  // Cancel matches POST /cancel — resend allowed while cancel_requested.
  const canCancel = runDetailCanCancel({
    status,
    hasResult: Boolean(result),
    cancelling,
  });
  const retryTerminal =
    status === "failed" ||
    status === "cancelled" ||
    status === "budget_stop";
  const quotaBlocked = isRetryBillingBlocked(data.status?.errorCode);
  // Server mirrors POST /retry; fail-closed until admission present.
  const retryAdmission = data.retryAdmission;
  const canRetry =
    !retrying &&
    !budgetStopWindDown &&
    retryAdmission?.canRetry === true;
  const retryBlockedReason = budgetStopWindDown
    ? RETRY_STILL_FINISHING_ERROR
    : retryAdmission == null && retryTerminal
      ? "Checking retry admission…"
      : (retryAdmission?.blockedReason ?? null);

  // Terminal: refresh GET so preflight / COST_CAP / Ready update together.
  useEffect(() => {
    if (!retryTerminal || budgetStopWindDown || polling) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 8000);
    return () => window.clearInterval(id);
  }, [retryTerminal, budgetStopWindDown, polling, refresh]);

  async function onRetry() {
    if (!canRetry) return;
    setRetryError(null);
    setRetrying(true);
    try {
      const res = await apiFetch(
        `/api/runs/${encodeURIComponent(runId)}/retry`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        errorCode?: string;
        runId?: string;
        costCapUsd?: number;
        blockers?: string[];
      };
      if (!res.ok || !body.runId) {
        setRetryError(
          tryResolveAuthApiError(body) ??
            resolveRetryPostError(body, formatRetryCostBlockedReason),
        );
        setRetrying(false);
        return;
      }
      router.push(withPilotFocus(`/runs/${body.runId}`, pilotFocus));
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setRetrying(false);
        return;
      }
      setRetryError(
        resolveRetryPostError(
          { errorCode: "retry_failed" },
          formatRetryCostBlockedReason,
        ),
      );
      setRetrying(false);
    }
  }

  async function onCancel() {
    if (!canCancel) return;
    setCancelError(null);
    setCancelAlsoRunId(null);
    setCancelling(true);
    try {
      const res = await apiFetch(
        `/api/runs/${encodeURIComponent(runId)}/cancel`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        errorCode?: string;
        status?: string;
        alsoCancelled?: unknown;
      };
      if (!res.ok) {
        setCancelError(
          tryResolveAuthApiError(body) ?? resolveCancelPostError(body),
        );
        setCancelling(false);
        return;
      }
      setCancelAlsoRunId(parseAlsoCancelledRunId(body.alsoCancelled));
      setPolling(true);
      await refresh();
      // Clear busy flag even while cancel_requested still polls — otherwise
      // Resend cancel stays disabled as "Cancelling…" until remount.
      setCancelling(false);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setCancelling(false);
        return;
      }
      setCancelError(resolveCancelPostError({ errorCode: "cancel_failed" }));
      setCancelling(false);
    }
  }

  async function onManualRefresh() {
    setRefreshBusy(true);
    setPollError(null);
    // Copy promises "Refresh (heal)" for orphan wind-down — healRunForRead alone
    // leaves budget_stop / cancel_requested stuck; finalize settles dead workers.
    const healSelf = isOrphanActiveWindDown(
      data.status?.status,
      Boolean(data.result),
    );
    const siblingIds = [...new Set(data.pairWindDownRunIds ?? [])].filter(
      (id) => id && id !== runId,
    );
    for (const siblingId of siblingIds) {
      try {
        await apiFetch(runDetailFinalizeOrphansPath(siblingId), {
          cache: "no-store",
        });
      } catch {
        /* still refresh this run below */
      }
    }
    const next = await refresh({ finalizeOrphans: healSelf });
    if (
      healSelf &&
      next &&
      isOrphanActiveWindDown(next.status?.status, Boolean(next.result)) &&
      next.hasLiveJob === true
    ) {
      setFinalizeGen((g) => g + 1);
    }
    if ((next?.pairWindDownRunIds?.length ?? 0) > 0) {
      setPairFinalizeGen((g) => g + 1);
    }
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

  const refreshHealsOrphan = isOrphanActiveWindDown(
    data.status?.status,
    Boolean(data.result),
  );
  const coverageIssues = result
    ? taskScorecardCoverageIssues(result.taskIds, result.perTask, {
        requireFiniteScores: result.status === "ok",
        runScore: result.status === "ok" ? result.score : undefined,
      })
    : [];
  const scorecardBroken = coverageIssues.length > 0;
  const { passed, total } = result
    ? taskScorecardPassCounts(result.taskIds, result.perTask)
    : { passed: 0, total: 0 };
  const displayScore = scorecardBroken ? null : (result?.score ?? null);
  const scorecardRows = result
    ? listScorecardTaskIds(result.taskIds, result.perTask).map((taskId) => {
        const row = result.perTask.find((t) => t.taskId === taskId);
        return (
          row ?? {
            taskId,
            score: null as number | null,
            status: "missing" as const,
            diffRatio: undefined as number | undefined,
          }
        );
      })
    : [];

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">
            <Link href={withPilotFocus("/runs", pilotFocus)}>Unikie · Runs</Link>
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
              {resolvedEvaluationId ? (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    href={withPilotFocus(
                      `/comparison/${resolvedEvaluationId}`,
                      pilotFocus,
                    )}
                  >
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
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle
            pathname="/runs"
            pilotFocus={pilotFocus}
            detailHref={`/runs/${runId}`}
          />
        </div>
      </header>
      <div className="action-row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-ghost btn-compact"
          disabled={refreshBusy}
          onClick={() => void onManualRefresh()}
          title={
            refreshHealsOrphan
              ? "Finalize orphan wind-down (heal) then refresh"
              : undefined
          }
        >
          {refreshBusy
            ? "Refreshing…"
            : refreshHealsOrphan
              ? "Refresh (heal)"
              : "Refresh"}
        </button>
      </div>
      {result ? (
        <p className="hint">
          {(() => {
            const pair = data.pairHarness;
            const hint = benefitCtaHint({
              runId,
              role: result.role,
              evaluationId: resolvedEvaluationId ?? undefined,
              fakeProduce: result.capture?.env?.fakeProduce === true,
              produceAttested: result.capture?.env?.produceAttested === true,
              tipCandidateRunId: data.tipCandidateRunId,
              ...(pair
                ? {
                    pairEvidence: {
                      metaSmoke: pair.metaSmoke,
                      baselineFakeProduce: pair.baselineFakeProduce,
                      candidateFakeProduce: pair.candidateFakeProduce,
                      baselineProduceAttested: pair.baselineProduceAttested,
                      candidateProduceAttested: pair.candidateProduceAttested,
                    },
                  }
                : {}),
            });
            if (hint.kind === "baseline") {
              return hint.comparisonHref ? (
                <Link href={withPilotFocus(hint.comparisonHref, pilotFocus)}>
                  Open paired Comparison →
                </Link>
              ) : (
                "Baseline leg — use Comparison for PASS/FAIL (no skill Benefit)."
              );
            }
            if (hint.kind === "missing_role") {
              return "Missing eval role — Benefit / Comparison require explicit baseline or candidate.";
            }
            if (hint.kind === "smoke") {
              return (
                <>
                  Smoke harness (FAKE_PRODUCE) — not adoption.{" "}
                  <Link href={withPilotFocus(`/benefit/${runId}`, pilotFocus)}>
                    Open smoke report →
                  </Link>
                </>
              );
            }
            if (hint.kind === "not_attested") {
              return (
                <>
                  Not produce-attested — not live worker evidence.{" "}
                  <Link href={withPilotFocus(`/benefit/${runId}`, pilotFocus)}>
                    Open unattested report →
                  </Link>
                </>
              );
            }
            if (hint.kind === "superseded") {
              return (
                <>
                  Superseded candidate — tip is{" "}
                  <Link
                    href={withPilotFocus(
                      `/benefit/${hint.tipRunId}`,
                      pilotFocus,
                    )}
                  >
                    {hint.tipRunId}
                  </Link>
                  .
                </>
              );
            }
            if (hint.kind === "pair_blocked") {
              return (
                <>
                  Pair evidence blocked (sibling smoke / unattested).{" "}
                  <Link
                    href={withPilotFocus(hint.comparisonHref, pilotFocus)}
                  >
                    Open Comparison →
                  </Link>
                </>
              );
            }
            const cta = benefitPairCtaLabel(data.pairPending, {
              detailArrow: true,
            });
            return (
              <Link
                href={withPilotFocus(`/benefit/${runId}`, pilotFocus)}
                title={cta.title}
              >
                {cta.label}
              </Link>
            );
          })()}
        </p>
      ) : null}

      {data.pairPending === "waiting" && pairWindDownKey ? (
        <div style={{ marginTop: 8 }}>
          <p className="hint">
            {pairOrphanStuck
              ? "Orphan wind-down stuck — Cancel / Resend cancel or Refresh (heal)"
              : "Sibling cost-cap or cancel wind-down — auto-settle after shared orphan timeout"}
          </p>
          <p className="hint" style={{ marginTop: 6 }}>
            {pairWindDownKey
              .split("\0")
              .filter((id) => id && id !== runId)
              .map((id, i) => (
                <span key={id}>
                  {i > 0 ? " · " : null}
                  <Link
                    href={withPilotFocus(`/runs/${id}`, pilotFocus)}
                    title="Open sibling — Cancel / Resend cancel or Refresh (heal)"
                  >
                    {pairOrphanStuck
                      ? `Settle stuck leg ${id}`
                      : `Open wind-down leg ${id}`}
                  </Link>
                </span>
              ))}
          </p>
        </div>
      ) : null}

      {data.pairHarness ? (
        <ComparisonHarnessCallouts
          metaSmoke={data.pairHarness.metaSmoke}
          baselineFakeProduce={data.pairHarness.baselineFakeProduce}
          candidateFakeProduce={data.pairHarness.candidateFakeProduce}
          baselineProduceAttested={data.pairHarness.baselineProduceAttested}
          candidateProduceAttested={data.pairHarness.candidateProduceAttested}
          baselineRunId={data.pairHarness.baselineRunId}
          candidateRunId={data.pairHarness.candidateRunId}
          pilotFocus={pilotFocus}
        />
      ) : null}

      {pollError ? (
        <p className="form-error" role="alert">
          {pollError}
        </p>
      ) : null}

      <div className="meta-row">
        <span
          className={`${statusBadgeClass(status, Boolean(result))}${polling && !pollError ? " badge-live" : ""}`}
        >
          {status}
        </span>
        {result ? (
          <span
            className="score"
            title={
              scorecardBroken
                ? `Scorecard incomplete — aggregate hidden (${coverageIssues.join("; ")})`
                : "Aggregate score"
            }
          >
            <span className="stat-label">Score </span>
            {displayScore ?? "—"}
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

      {/* Keep Cancel panel visible even when live poll failed. */}
      {status === "running" ||
      status === "queued" ||
      cancelRequested ||
      budgetStopWindDown ? (
        <div className="panel progress-panel">
          <div className="progress-head">
            <strong>
              {cancelRequested
                ? "Cancel requested — stopping worker"
                : budgetStopWindDown
                  ? budgetStoppingLive
                    ? "Cost cap reached — finishing"
                    : "Cost cap wind-down — no result yet"
                  : isQueued
                    ? "Queued — waiting for worker"
                    : "Running"}
              {!isQueued &&
              !cancelRequested &&
              !budgetStopWindDown &&
              repeat &&
              repeats
                ? ` · repeat ${repeat}/${repeats}`
                : ""}
            </strong>
            <span>
              {isQueued || cancelRequested || budgetStopWindDown
                ? "…"
                : `${progress}%`}
            </span>
          </div>
          <div
            className={`progress-track${isQueued || cancelRequested || budgetStopWindDown ? " is-indeterminate" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              isQueued || cancelRequested || budgetStopWindDown
                ? undefined
                : progress
            }
            aria-busy={
              isQueued || cancelRequested || budgetStoppingLive || undefined
            }
            aria-label={
              cancelRequested
                ? "Cancel requested"
                : budgetStopWindDown
                  ? budgetStoppingLive
                    ? "Cost cap reached, finishing"
                    : "Cost cap wind-down, waiting for result or cancel"
                  : isQueued
                    ? "Queued, waiting for worker"
                    : "Run progress"
            }
          >
            <div
              className="progress-fill"
              style={
                isQueued || cancelRequested || budgetStopWindDown
                  ? undefined
                  : { width: `${progress}%` }
              }
            />
          </div>
          <div className="action-row progress-actions">
            <p className="hint">
              {cancelling
                ? "Cancel requested — waiting for the worker to stop."
                : cancelRequested
                  ? "Cancel requested — waiting for the worker to stop. Resend refreshes the .cancel marker; after the shared orphan timeout Refresh (heal) settles a dead worker."
                  : budgetStoppingLive
                    ? "Cost hard-stop hit — writing final result (no further produce/grade)."
                    : budgetStopWindDown
                      ? "Worker may be gone — Cancel to settle, or Refresh (heal). Retry stays blocked until result.json exists."
                      : "Refresh is automatic. You can leave this page open."}
            </p>
            <button
              type="button"
              className="btn btn-danger btn-compact"
              disabled={!canCancel}
              onClick={() => void onCancel()}
            >
              {cancelling
                ? "Cancelling…"
                : cancelRequested
                  ? "Resend cancel"
                  : "Cancel run"}
            </button>
          </div>
          {cancelError ? (
            <p className="form-error" role="alert">
              {cancelError}
            </p>
          ) : null}
          {cancelAlsoRunId ? (
            <AlsoCancelledHint
              alsoRunId={cancelAlsoRunId}
              pilotFocus={pilotFocus}
            />
          ) : null}
        </div>
      ) : null}

      {result ? (
        <>
          {scorecardBroken ? (
            <div className="panel callout-warn">
              <strong>Incomplete task scorecard</strong>
              <p>
                Declared taskIds and per-task rows do not line up (
                {passed}/{total || 0} soft-pass). Aggregate score is hidden —
                open Benefit for the same fail-closed gate, or re-run for a
                complete scorecard.
              </p>
              <p className="hint" style={{ marginBottom: 0 }}>
                {coverageIssues.join("; ")}
              </p>
            </div>
          ) : null}
          <div className="stat-strip stat-strip-5">
            <div className="stat">
              <span className="stat-label">Tasks passed</span>
              <span
                className="stat-value"
                title={
                  scorecardBroken
                    ? "Counted against declared taskIds (missing ≠ passed)"
                    : undefined
                }
              >
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
            {scorecardRows.length === 0 ? (
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
                    {scorecardRows.map((t) => (
                      <tr key={t.taskId}>
                        <td>
                          <code>{t.taskId}</code>
                        </td>
                        <td>{t.score ?? "—"}</td>
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
            {data.csvExportAllowed ? (
              <ExportDownloadButton
                className="btn btn-ghost"
                href={`/api/runs/${encodeURIComponent(runId)}/csv`}
                filename={`${runId}.csv`}
                title="Official Comparison PASS/FAIL on a current meta leg"
              >
                Download CSV
              </ExportDownloadButton>
            ) : (
              <span
                className="hint"
                style={{ margin: 0, alignSelf: "center", maxWidth: "28rem" }}
                title={
                  data.csvExportBlockReason ?? EXPORT_RUN_CSV_LOCKED_FALLBACK
                }
              >
                {data.csvExportBlockReason ?? EXPORT_RUN_CSV_LOCKED_FALLBACK}
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setJsonOpen((v) => !v)}
            >
              {jsonOpen ? "Hide raw JSON" : "Show raw JSON"}
            </button>
            {resolvedEvaluationId ? (
              <Link
                className="btn btn-ghost"
                href={withPilotFocus(
                  `/comparison/${resolvedEvaluationId}`,
                  pilotFocus,
                )}
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
                  <>
                    <div>
                      <dt>Produce evidence</dt>
                      <dd>
                        {formatCaptureEnvEvidence({
                          fakeProduce: result.capture.env.fakeProduce,
                          produceAttested: result.capture.env.produceAttested,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>Grade policy</dt>
                      <dd>
                        {formatCaptureGradePolicy({
                          grade: result.capture.env.grade,
                          allowHostGrade: result.capture.env.allowHostGrade,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>Env snapshot</dt>
                      <dd>
                        {formatCaptureEnvSnapshot({
                          temperature: result.capture.env.temperature,
                          seed: result.capture.env.seed,
                          costCapUsd: result.capture.env.costCapUsd,
                          grade: result.capture.env.grade,
                          allowHostGrade: result.capture.env.allowHostGrade,
                        })}
                      </dd>
                    </div>
                  </>
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
          {cancelAlsoRunId ? (
            <AlsoCancelledHint
              alsoRunId={cancelAlsoRunId}
              pilotFocus={pilotFocus}
            />
          ) : null}
          {status === "failed" ||
          status === "cancelled" ||
          status === "budget_stop" ||
          canRetry ? (
            <RetryActions
              canRetry={canRetry}
              retrying={retrying}
              retryError={retryError}
              blockedReason={retryBlockedReason}
              onRetry={() => void onRetry()}
            />
          ) : null}
        </>
      ) : status === "cancelled" ? (
        <div className="panel">
          <p className="empty">
            Run cancelled before a scorecard was produced.
          </p>
          {cancelAlsoRunId ? (
            <AlsoCancelledHint
              alsoRunId={cancelAlsoRunId}
              pilotFocus={pilotFocus}
            />
          ) : null}
          <RetryActions
            canRetry={canRetry}
            retrying={retrying}
            retryError={retryError}
            blockedReason={retryBlockedReason}
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
              {RETRY_INSUFFICIENT_QUOTA_BLOCKED}
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
            blockedReason={retryBlockedReason}
            onRetry={() => void onRetry()}
          />
        </div>
      ) : budgetStopWindDown ? null : (
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
