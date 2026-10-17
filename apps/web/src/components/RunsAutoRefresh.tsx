"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { runDetailFinalizeOrphansPath } from "@/lib/healOrphans";
import { WIND_DOWN_ORPHAN_MS } from "@/lib/runLifecycle";

export function RunsAutoRefresh({
  hasActive,
  windDownRunIds = [],
}: {
  /** True when any listed run is still queued/running. */
  hasActive: boolean;
  /**
   * Orphan budget_stop legs (no result.json). After WIND_DOWN_ORPHAN_MS,
   * GET ?finalizeOrphans=1 so list status matches run detail / pending pages.
   */
  windDownRunIds?: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const windDownKey = [...new Set(windDownRunIds)].sort().join("\0");

  useEffect(() => {
    if (!hasActive) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 3000);
    return () => window.clearInterval(id);
  }, [hasActive, router]);

  useEffect(() => {
    if (!windDownKey) return;
    const ids = windDownKey.split("\0").filter(Boolean);
    const timers = ids.map((runId) =>
      window.setTimeout(() => {
        void (async () => {
          try {
            await apiFetch(runDetailFinalizeOrphansPath(runId), {
              cache: "no-store",
            });
          } catch {
            /* refresh still shows disk state */
          }
          router.refresh();
        })();
      }, WIND_DOWN_ORPHAN_MS),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [windDownKey, router]);

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
