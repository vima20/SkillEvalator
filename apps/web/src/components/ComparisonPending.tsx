"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import {
  runDetailFinalizeOrphansPath,
  WIND_DOWN_ORPHAN_MS,
} from "@/lib/runLifecycle";
import {
  comparisonPendingState,
  orphanStuckFromFinalizePayload,
  statusBadgeClass,
} from "@/lib/status";

/** true = orphan stuck; false = live job still finishing / retry (re-arm). */
async function finalizeOrphanLeg(
  runId: string | undefined,
): Promise<boolean> {
  if (!runId) return true;
  try {
    const res = await apiFetch(runDetailFinalizeOrphansPath(runId), {
      cache: "no-store",
    });
    if (!res.ok) return true;
    const body = (await res.json().catch(() => ({}))) as {
      status?: { status?: string } | null;
      result?: unknown | null;
      hasLiveJob?: boolean;
    };
    return orphanStuckFromFinalizePayload(body);
  } catch {
    return true;
  }
}

type ComparisonPendingProps = {
  evaluationId: string;
  baselineRunId?: string;
  candidateRunId?: string;
  baselineStatus?: string;
  candidateStatus?: string;
  /** True when that leg already has result.json (budget_stop may be settled). */
  baselineHasResult?: boolean;
  candidateHasResult?: boolean;
};

export function ComparisonPending(props: ComparisonPendingProps) {
  return (
    <Suspense
      fallback={<ComparisonPendingInner {...props} pilotFocus={false} />}
    >
      <ComparisonPendingWithFocus {...props} />
    </Suspense>
  );
}

function ComparisonPendingWithFocus(props: ComparisonPendingProps) {
  const searchParams = useSearchParams();
  const pilotFocus = isPilotFocusParam(
    searchParams.get("focus") ?? undefined,
  );
  return <ComparisonPendingInner {...props} pilotFocus={pilotFocus} />;
}

function ComparisonPendingInner({
  evaluationId,
  baselineRunId,
  candidateRunId,
  baselineStatus,
  candidateStatus,
  baselineHasResult = false,
  candidateHasResult = false,
  pilotFocus,
}: ComparisonPendingProps & { pilotFocus: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [baselineBudgetTimedOut, setBaselineBudgetTimedOut] = useState(false);
  const [candidateBudgetTimedOut, setCandidateBudgetTimedOut] = useState(false);
  const [baselineFinalizeGen, setBaselineFinalizeGen] = useState(0);
  const [candidateFinalizeGen, setCandidateFinalizeGen] = useState(0);

  const {
    baselineWindDown,
    candidateWindDown,
    windDown,
    stillWaiting,
    unavailable,
    orphanStuck,
  } = comparisonPendingState({
    baseline: {
      status: baselineStatus,
      hasResult: baselineHasResult,
      budgetTimedOut: baselineBudgetTimedOut,
    },
    candidate: {
      status: candidateStatus,
      hasResult: candidateHasResult,
      budgetTimedOut: candidateBudgetTimedOut,
    },
  });

  useEffect(() => {
    if (!baselineWindDown) {
      setBaselineBudgetTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        const stuck = await finalizeOrphanLeg(baselineRunId);
        setBaselineBudgetTimedOut(stuck);
        router.refresh();
        if (!stuck) setBaselineFinalizeGen((g) => g + 1);
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(id);
  }, [
    baselineWindDown,
    evaluationId,
    baselineRunId,
    router,
    baselineFinalizeGen,
  ]);

  useEffect(() => {
    if (!candidateWindDown) {
      setCandidateBudgetTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        const stuck = await finalizeOrphanLeg(candidateRunId);
        setCandidateBudgetTimedOut(stuck);
        router.refresh();
        if (!stuck) setCandidateFinalizeGen((g) => g + 1);
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(id);
  }, [
    candidateWindDown,
    evaluationId,
    candidateRunId,
    router,
    candidateFinalizeGen,
  ]);

  // Poll while waiting OR orphanStuck — external heal (run detail / list) must
  // clear stale "Settle the stuck leg" without a hard reload.
  useEffect(() => {
    if (!stillWaiting && !orphanStuck) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [router, evaluationId, stillWaiting, orphanStuck]);

  const pageHeading = orphanStuck
    ? "Settle the stuck leg"
    : unavailable
      ? "Comparison unavailable"
      : windDown
        ? "Writing final results"
        : "Waiting for results";
  const eyebrow = orphanStuck
    ? "Orphan wind-down stuck"
    : unavailable
      ? "Comparison unavailable"
      : windDown
        ? "Wind-down in progress"
        : "Waiting for both legs";
  const title = orphanStuck
    ? "Settle the stuck leg on its run page"
    : unavailable
      ? "Cannot build comparison"
      : windDown
        ? "Writing final results"
        : "Comparison not ready";
  const body = orphanStuck
    ? stillWaiting
      ? "A tip is stuck in budget_stop or cancel_requested without result.json (worker may be gone). Settle that leg now — Cancel / Resend cancel or Refresh (heal) — while the other tip may still be running."
      : "A tip is stuck in budget_stop or cancel_requested without result.json (worker may be gone). Open that run → Cancel / Resend cancel or Refresh (heal). Retry unlocks after settle — same as run detail."
    : unavailable
      ? "Both baseline and candidate finished without a complete paired scorecard (failed, cancelled, or budget_stop without usable results). Open the run pages for details, or start a new paired evaluation."
      : windDown
        ? "A tip is in cost-cap or cancel wind-down. Each wind-down leg gets its own orphan timeout; polling continues while the other leg is still active."
        : "Baseline and candidate must finish before lift and PASS/FAIL can be computed. This page refreshes automatically.";

  const stuckBaselineId =
    baselineWindDown && baselineBudgetTimedOut ? baselineRunId : undefined;
  const stuckCandidateId =
    candidateWindDown && candidateBudgetTimedOut ? candidateRunId : undefined;

  return (
    <>
      <h1 style={{ marginBottom: 16 }}>{pageHeading}</h1>
      <div className="panel progress-panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{body}</p>
      <dl className="meta-list">
        <div>
          <dt>Baseline</dt>
          <dd>
            <span
              className={statusBadgeClass(baselineStatus, baselineHasResult)}
            >
              {baselineStatus ?? "missing"}
            </span>
            {baselineRunId ? (
              <>
                {" "}
                <Link
                  href={withPilotFocus(`/runs/${baselineRunId}`, pilotFocus)}
                >
                  {baselineRunId}
                </Link>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Candidate</dt>
          <dd>
            <span
              className={statusBadgeClass(candidateStatus, candidateHasResult)}
            >
              {candidateStatus ?? "missing"}
            </span>
            {candidateRunId ? (
              <>
                {" "}
                <Link
                  href={withPilotFocus(`/runs/${candidateRunId}`, pilotFocus)}
                >
                  {candidateRunId}
                </Link>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Evaluation</dt>
          <dd>
            <code>{evaluationId}</code>
          </dd>
        </div>
      </dl>
      {orphanStuck ? (
        <div className="action-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void (async () => {
                if (stuckBaselineId) {
                  const stuck = await finalizeOrphanLeg(stuckBaselineId);
                  setBaselineBudgetTimedOut(stuck);
                  if (!stuck) setBaselineFinalizeGen((g) => g + 1);
                }
                if (stuckCandidateId) {
                  const stuck = await finalizeOrphanLeg(stuckCandidateId);
                  setCandidateBudgetTimedOut(stuck);
                  if (!stuck) setCandidateFinalizeGen((g) => g + 1);
                }
                router.refresh();
                window.setTimeout(() => setBusy(false), 400);
              })();
            }}
          >
            {busy ? "Refreshing…" : "Refresh now"}
          </button>
          <p className="hint">
            Prefer the{" "}
            {stuckBaselineId ? (
              <Link
                href={withPilotFocus(`/runs/${stuckBaselineId}`, pilotFocus)}
              >
                baseline run
              </Link>
            ) : null}
            {stuckBaselineId && stuckCandidateId ? " and " : null}
            {stuckCandidateId ? (
              <Link
                href={withPilotFocus(`/runs/${stuckCandidateId}`, pilotFocus)}
              >
                candidate run
              </Link>
            ) : null}
            {!stuckBaselineId && !stuckCandidateId
              ? candidateRunId
                ? (
                    <Link
                      href={withPilotFocus(
                        `/runs/${candidateRunId}`,
                        pilotFocus,
                      )}
                    >
                      candidate run
                    </Link>
                  )
                : baselineRunId
                  ? (
                      <Link
                        href={withPilotFocus(
                          `/runs/${baselineRunId}`,
                          pilotFocus,
                        )}
                      >
                        baseline run
                      </Link>
                    )
                  : (
                      "run page"
                    )
              : null}{" "}
            → Cancel / Resend cancel or Refresh (heal).
          </p>
        </div>
      ) : unavailable ? (
        <div className="action-row" style={{ marginTop: 12 }}>
          {candidateRunId && candidateHasResult ? (
            <Link
              className="btn btn-ghost btn-compact"
              href={withPilotFocus(`/benefit/${candidateRunId}`, pilotFocus)}
              title="No paired scorecard — open Benefit for Comparison unavailable detail"
            >
              Open Benefit — Comparison unavailable
            </Link>
          ) : candidateRunId ? (
            <Link
              className="btn btn-ghost btn-compact"
              href={withPilotFocus(`/runs/${candidateRunId}`, pilotFocus)}
              title="Tip candidate has no result.json — open run (Benefit needs a result)"
            >
              Open candidate run
            </Link>
          ) : null}
          <Link
            className="btn btn-primary btn-compact"
            href={withPilotFocus("/", pilotFocus)}
          >
            Start a new baseline↔candidate run
          </Link>
        </div>
      ) : stillWaiting ? (
        <div className="action-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void (async () => {
                // List / run detail parity: finalize wind-down legs before stuck.
                if (baselineWindDown && baselineRunId) {
                  const stuck = await finalizeOrphanLeg(baselineRunId);
                  setBaselineBudgetTimedOut(stuck);
                  if (!stuck) setBaselineFinalizeGen((g) => g + 1);
                }
                if (candidateWindDown && candidateRunId) {
                  const stuck = await finalizeOrphanLeg(candidateRunId);
                  setCandidateBudgetTimedOut(stuck);
                  if (!stuck) setCandidateFinalizeGen((g) => g + 1);
                }
                router.refresh();
                window.setTimeout(() => setBusy(false), 400);
              })();
            }}
          >
            {busy ? "Refreshing…" : "Refresh now"}
          </button>
          {candidateRunId && candidateHasResult ? (
            <Link
              className="btn btn-ghost btn-compact"
              href={withPilotFocus(`/benefit/${candidateRunId}`, pilotFocus)}
              title="Candidate result ready — Benefit waiting for paired Comparison"
            >
              Open Benefit — waiting for Comparison
            </Link>
          ) : candidateRunId ? (
            <Link
              className="btn btn-ghost btn-compact"
              href={withPilotFocus(`/runs/${candidateRunId}`, pilotFocus)}
              title="Tip candidate still running — open run (Benefit needs a result)"
            >
              Open candidate run
            </Link>
          ) : null}
        </div>
      ) : null}
      </div>
    </>
  );
}
