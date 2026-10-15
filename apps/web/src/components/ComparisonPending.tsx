"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import { comparisonPendingState, statusBadgeClass } from "@/lib/status";

/** Orphan wait for budget_stop → result.json per leg. */
const WIND_DOWN_MS = 90_000;

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
    const id = window.setTimeout(
      () => setBaselineBudgetTimedOut(true),
      WIND_DOWN_MS,
    );
    return () => window.clearTimeout(id);
  }, [baselineWindDown, evaluationId, baselineRunId]);

  useEffect(() => {
    if (!candidateWindDown) {
      setCandidateBudgetTimedOut(false);
      return;
    }
    const id = window.setTimeout(
      () => setCandidateBudgetTimedOut(true),
      WIND_DOWN_MS,
    );
    return () => window.clearTimeout(id);
  }, [candidateWindDown, evaluationId, candidateRunId]);

  useEffect(() => {
    if (!stillWaiting) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [router, evaluationId, stillWaiting]);

  return (
    <div className="panel progress-panel">
      <p className="eyebrow">
        {unavailable
          ? "Comparison unavailable"
          : windDown
            ? "Cost hard-stop wind-down"
            : "Waiting for both legs"}
      </p>
      <h2>
        {unavailable
          ? "Cannot build comparison"
          : windDown
            ? "Writing final results"
            : "Comparison not ready"}
      </h2>
      <p>
        {unavailable
          ? "Both baseline and candidate finished without a complete paired scorecard (failed, cancelled, or budget_stop without usable results). Open the run pages for details, or start a new paired evaluation."
          : windDown
            ? "A leg hit the cost cap and is writing its final result.json. Each wind-down leg gets its own orphan timeout; polling continues while the other leg is still active."
            : "Baseline and candidate must finish before lift and PASS/FAIL can be computed. This page refreshes automatically."}
      </p>
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
      {unavailable ? (
        <p className="hint" style={{ marginTop: 12 }}>
          <Link href="/">Start a new baseline↔candidate run</Link>
        </p>
      ) : null}
    </div>
  );
}
