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
import { comparisonPendingState, statusBadgeClass } from "@/lib/status";

async function finalizeOrphanLeg(runId: string | undefined): Promise<void> {
  if (!runId) return;
  try {
    await apiFetch(runDetailFinalizeOrphansPath(runId), { cache: "no-store" });
  } catch {
    /* refresh still shows disk state */
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
  const [baselineBudgetTimedOut, setBaselineBudgetTimedOut] = useState(false);
  const [candidateBudgetTimedOut, setCandidateBudgetTimedOut] = useState(false);

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
      setBaselineBudgetTimedOut(true);
      void (async () => {
        await finalizeOrphanLeg(baselineRunId);
        router.refresh();
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(id);
  }, [baselineWindDown, evaluationId, baselineRunId, router]);

  useEffect(() => {
    if (!candidateWindDown) {
      setCandidateBudgetTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => {
      setCandidateBudgetTimedOut(true);
      void (async () => {
        await finalizeOrphanLeg(candidateRunId);
        router.refresh();
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(id);
  }, [candidateWindDown, evaluationId, candidateRunId, router]);

  useEffect(() => {
    if (!stillWaiting) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [router, evaluationId, stillWaiting]);

  const eyebrow = orphanStuck
    ? "Orphan cost-cap wind-down"
    : unavailable
      ? "Comparison unavailable"
      : windDown
        ? "Cost hard-stop wind-down"
        : "Waiting for both legs";
  const title = orphanStuck
    ? "Settle the stuck leg on its run page"
    : unavailable
      ? "Cannot build comparison"
      : windDown
        ? "Writing final results"
        : "Comparison not ready";
  const body = orphanStuck
    ? "A tip hit COST_CAP_USD and never wrote result.json (worker may be gone). Open that run → Cancel or Refresh (heal). Retry stays blocked until result.json exists — same as run detail."
    : unavailable
      ? "Both baseline and candidate finished without a complete paired scorecard (failed, cancelled, or budget_stop without usable results). Open the run pages for details, or start a new paired evaluation."
      : windDown
        ? "A leg hit the cost cap and is writing its final result.json. Each wind-down leg gets its own orphan timeout; polling continues while the other leg is still active."
        : "Baseline and candidate must finish before lift and PASS/FAIL can be computed. This page refreshes automatically.";

  return (
    <div className="panel progress-panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{body}</p>
      <dl className="meta-list">
        <div>
          <dt>Baseline</dt>
          <dd>
            <span className={statusBadgeClass(baselineStatus)}>
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
            <span className={statusBadgeClass(candidateStatus)}>
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
        <p className="hint" style={{ marginTop: 12 }}>
          Prefer the{" "}
          {baselineWindDown && baselineBudgetTimedOut && baselineRunId ? (
            <Link href={withPilotFocus(`/runs/${baselineRunId}`, pilotFocus)}>
              baseline run
            </Link>
          ) : candidateRunId ? (
            <Link href={withPilotFocus(`/runs/${candidateRunId}`, pilotFocus)}>
              candidate run
            </Link>
          ) : (
            "run page"
          )}{" "}
          → Cancel / Refresh.
        </p>
      ) : unavailable ? (
        <p className="hint" style={{ marginTop: 12 }}>
          <Link href={withPilotFocus("/", pilotFocus)}>
            Start a new baseline↔candidate run
          </Link>
        </p>
      ) : null}
    </div>
  );
}
