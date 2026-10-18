"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Benefit detail with result.json but pairPending=waiting: poll until sibling
 * Comparison lands (same cadence as BenefitPending / ComparisonPending).
 */
export function BenefitPairWaitingRefresh() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [router]);

  return (
    <div className="action-row" style={{ marginTop: 12 }}>
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
      <span className="hint">Auto-refresh while Comparison catches up</span>
    </div>
  );
}
