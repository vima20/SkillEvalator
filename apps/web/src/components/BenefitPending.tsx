"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import { benefitPendingState } from "@/lib/status";

/** Auto-refresh while waiting for result.json / benefit report. */
export function BenefitPending(props: {
  runId: string;
  status?: string | null;
}) {
  return (
    <Suspense fallback={<BenefitPendingInner {...props} pilotFocus={false} />}>
      <BenefitPendingWithFocus {...props} />
    </Suspense>
  );
}

function BenefitPendingWithFocus(props: {
  runId: string;
  status?: string | null;
}) {
  const searchParams = useSearchParams();
  const pilotFocus = isPilotFocusParam(
    searchParams.get("focus") ?? undefined,
  );
  return <BenefitPendingInner {...props} pilotFocus={pilotFocus} />;
}

function BenefitPendingInner({
  runId,
  status,
  pilotFocus,
}: {
  runId: string;
  status?: string | null;
  pilotFocus: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [budgetTimedOut, setBudgetTimedOut] = useState(false);

  const { windDown, stillWaiting, unavailable } = benefitPendingState({
    status,
    budgetTimedOut,
  });

  useEffect(() => {
    if (!windDown) {
      setBudgetTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setBudgetTimedOut(true), 90_000);
    return () => window.clearTimeout(id);
  }, [windDown, runId]);

  useEffect(() => {
    if (!stillWaiting) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [router, stillWaiting]);

  return (
    <div className="panel">
      <div className="empty-state">
        <div className="empty-state-mark" aria-hidden="true" />
        <h2>
          {unavailable
            ? "No Benefit Report"
            : windDown
              ? "Writing final result"
              : "No result yet"}
        </h2>
        <p>
          {unavailable
            ? `This run ended as ${status ?? "unknown"} without a result.json, so a Benefit Report cannot be built. Open the run for status details or Retry.`
            : windDown
              ? "Cost hard-stop is writing the final result.json. This page refreshes automatically (stops after ~90s if the worker is stuck)."
              : "This run has no result.json yet. Waiting for the worker — this page refreshes automatically."}
        </p>
        <div className="action-row" style={{ marginTop: 14 }}>
          {stillWaiting ? (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                router.refresh();
                window.setTimeout(() => setBusy(false), 400);
              }}
            >
              {busy ? "Refreshing…" : "Refresh now"}
            </button>
          ) : null}
          <Link
            className="btn btn-primary btn-compact"
            href={withPilotFocus(`/runs/${runId}`, pilotFocus)}
          >
            Open run
          </Link>
        </div>
      </div>
    </div>
  );
}
