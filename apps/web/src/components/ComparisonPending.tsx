"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { runIsActive, statusBadgeClass } from "@/lib/status";

/** Hard-finished — no more result.json expected. */
const SETTLED = new Set(["ok", "failed", "cancelled"]);

export function ComparisonPending({
  evaluationId,
  baselineRunId,
  candidateRunId,
  baselineStatus,
  candidateStatus,
  baselineHasResult = false,
  candidateHasResult = false,
}: {
  evaluationId: string;
  baselineRunId?: string;
  candidateRunId?: string;
  baselineStatus?: string;
  candidateStatus?: string;
  /** True when that leg already has result.json (budget_stop may be settled). */
  baselineHasResult?: boolean;
  candidateHasResult?: boolean;
}) {
  const router = useRouter();
  const [budgetTimedOut, setBudgetTimedOut] = useState(false);

  const baselineWindDown =
    baselineStatus === "budget_stop" && !baselineHasResult;
  const candidateWindDown =
    candidateStatus === "budget_stop" && !candidateHasResult;
  const windDown = baselineWindDown || candidateWindDown;

  // Wind-down without result stays active until result.json or orphan timeout.
  const baselineActive =
    runIsActive(baselineStatus, baselineHasResult) &&
    !(baselineWindDown && budgetTimedOut);
  const candidateActive =
    runIsActive(candidateStatus, candidateHasResult) &&
    !(candidateWindDown && budgetTimedOut);
  const stillWaiting = baselineActive || candidateActive;

  const baselineSettled =
    SETTLED.has(baselineStatus ?? "") ||
    (baselineStatus === "budget_stop" &&
      (baselineHasResult || budgetTimedOut));
  const candidateSettled =
    SETTLED.has(candidateStatus ?? "") ||
    (candidateStatus === "budget_stop" &&
      (candidateHasResult || budgetTimedOut));

  // Only unavailable when neither leg can still produce a usable scorecard.
  // One leg may time out on budget_stop while the other is still queued/running —
  // keep polling until that other leg settles too.
  const unavailable =
    !stillWaiting && baselineSettled && candidateSettled;

  useEffect(() => {
    if (!windDown) {
      setBudgetTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setBudgetTimedOut(true), 90_000);
    return () => window.clearTimeout(id);
  }, [windDown, evaluationId]);

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
            ? "A leg hit the cost cap and is writing its final result.json. Polling continues while the other leg is still running (or until a short orphan timeout if wind-down stalls)."
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
                <Link href={`/runs/${baselineRunId}`}>{baselineRunId}</Link>
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
                <Link href={`/runs/${candidateRunId}`}>{candidateRunId}</Link>
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
