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
}: {
  evaluationId: string;
  baselineRunId?: string;
  candidateRunId?: string;
  baselineStatus?: string;
  candidateStatus?: string;
}) {
  const router = useRouter();
  const [budgetTimedOut, setBudgetTimedOut] = useState(false);

  const baselineSettled = SETTLED.has(baselineStatus ?? "");
  const candidateSettled = SETTLED.has(candidateStatus ?? "");
  const bothSettled = baselineSettled && candidateSettled;
  const windDown =
    baselineStatus === "budget_stop" || candidateStatus === "budget_stop";
  const stillWaiting =
    (runIsActive(baselineStatus, false) ||
      runIsActive(candidateStatus, false)) &&
    !budgetTimedOut;

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

  const unavailable = bothSettled || budgetTimedOut;

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
            ? "A leg hit the cost cap and is writing its final result.json. This page refreshes automatically until the scorecard is ready (or times out if the worker is stuck)."
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
