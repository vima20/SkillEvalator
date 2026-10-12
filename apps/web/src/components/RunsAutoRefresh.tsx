"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ACTIVE = new Set([
  "queued",
  "running",
  "cancel_requested",
  // Mid-finish cost-cap wind-down before result.json lands.
  "budget_stop",
]);

export function RunsAutoRefresh({
  hasActive,
}: {
  /** True when any listed run is still queued/running. */
  hasActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasActive) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [hasActive, router]);

  return (
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
      {busy ? "Refreshing…" : "Refresh"}
    </button>
  );
}

export function runIsActive(status: string | undefined): boolean {
  return ACTIVE.has(status ?? "");
}
