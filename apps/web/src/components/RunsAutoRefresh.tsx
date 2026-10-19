"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import {
  runDetailFinalizeOrphansPath,
  WIND_DOWN_ORPHAN_MS,
} from "@/lib/runLifecycle";
import { isOrphanActiveWindDown } from "@/lib/status";

export function RunsAutoRefresh({
  hasActive,
  windDownRunIds = [],
}: {
  /** True when any listed run is still queued/running. */
  hasActive: boolean;
  /**
   * Orphan wind-down legs (budget_stop / cancel_requested, no result.json).
   * After WIND_DOWN_ORPHAN_MS, GET ?finalizeOrphans=1 so list status matches
   * run detail / pending. Live jobs re-arm the same 90s window.
   */
  windDownRunIds?: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [finalizeGen, setFinalizeGen] = useState(0);
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
    const timer = window.setTimeout(() => {
      void (async () => {
        let rearm = false;
        await Promise.all(
          ids.map(async (runId) => {
            try {
              const res = await apiFetch(runDetailFinalizeOrphansPath(runId), {
                cache: "no-store",
              });
              const body = (await res.json().catch(() => ({}))) as {
                status?: { status?: string } | null;
                result?: unknown | null;
                hasLiveJob?: boolean;
              };
              if (
                isOrphanActiveWindDown(
                  body.status?.status,
                  Boolean(body.result),
                ) &&
                body.hasLiveJob === true
              ) {
                rearm = true;
              }
            } catch {
              /* refresh still shows disk state */
            }
          }),
        );
        router.refresh();
        if (rearm) setFinalizeGen((g) => g + 1);
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(timer);
  }, [windDownKey, router, finalizeGen]);

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
