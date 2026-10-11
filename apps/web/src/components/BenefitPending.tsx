"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TERMINAL = new Set(["ok", "failed", "cancelled", "budget_stop"]);

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
  const terminal = TERMINAL.has(status ?? "");

  useEffect(() => {
    if (terminal) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [router, terminal]);

  return (
    <div className="panel">
      <div className="empty-state">
        <div className="empty-state-mark" aria-hidden="true" />
        <h2>{terminal ? "No Benefit Report" : "No result yet"}</h2>
        <p>
          {terminal
            ? `This run ended as ${status} without a result.json, so a Benefit Report cannot be built. Open the run for status details or Retry.`
            : "This run has no result.json yet. Waiting for the worker — this page refreshes automatically."}
        </p>
        <div className="action-row" style={{ marginTop: 14 }}>
          {!terminal ? (
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
