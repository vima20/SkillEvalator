"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { runIsActive } from "@/lib/status";

const SETTLED = new Set(["ok", "failed", "cancelled"]);

/** Auto-refresh while waiting for result.json / benefit report. */
export function BenefitPending({
  runId,
  status,
}: {
  runId: string;
  status?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [budgetTimedOut, setBudgetTimedOut] = useState(false);

  const st = status ?? undefined;
  const windDown = st === "budget_stop";
  const settled = SETTLED.has(st ?? "");
  // Missing/unknown status: keep polling (status.json may not exist yet).
  const stillWaiting =
    !settled &&
    !(windDown && budgetTimedOut) &&
    (runIsActive(st, false) || windDown || !st);
  const unavailable = (settled || (windDown && budgetTimedOut)) && !stillWaiting;

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
          <Link className="btn btn-primary btn-compact" href={`/runs/${runId}`}>
            Open run
          </Link>
        </div>
      </div>
    </div>
  );
}
