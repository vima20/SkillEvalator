"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Auto-refresh while waiting for result.json / benefit report. */
export function BenefitPending({ runId }: { runId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [router]);

  return (
    <div className="panel">
      <div className="empty-state">
        <div className="empty-state-mark" aria-hidden="true" />
        <h2>No result yet</h2>
        <p>
          This run has no result.json yet. Waiting for the worker — this page
          refreshes automatically.
        </p>
        <div className="action-row" style={{ marginTop: 14 }}>
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
          <Link className="btn btn-primary btn-compact" href={`/runs/${runId}`}>
            Open run
          </Link>
        </div>
      </div>
    </div>
  );
}
