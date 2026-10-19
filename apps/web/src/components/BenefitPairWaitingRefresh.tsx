"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { withPilotFocus } from "@/lib/pilotFocusHref";
import {
  runDetailFinalizeOrphansPath,
  WIND_DOWN_ORPHAN_MS,
} from "@/lib/runLifecycle";
import { orphanStuckFromFinalizePayload } from "@/lib/status";

/**
 * Benefit detail with result.json but pairPending=waiting: poll until sibling
 * Comparison lands. Orphan budget_stop siblings get the same 90s finalize as
 * ComparisonPending / RunsAutoRefresh so waiting cannot stick forever.
 */
export function BenefitPairWaitingRefresh({
  windDownRunIds = [],
  pilotFocus = false,
}: {
  /** Tip legs in budget_stop without result.json. */
  windDownRunIds?: string[];
  pilotFocus?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [orphanStuck, setOrphanStuck] = useState(false);
  const [finalizeGen, setFinalizeGen] = useState(0);
  const windDownKey = [...new Set(windDownRunIds)].sort().join("\0");

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [router]);

  useEffect(() => {
    if (!windDownKey) {
      setOrphanStuck(false);
      return;
    }
    const ids = windDownKey.split("\0").filter(Boolean);
    const timers = ids.map((runId) =>
      window.setTimeout(() => {
        void (async () => {
          let stuck = true;
          try {
            const res = await apiFetch(runDetailFinalizeOrphansPath(runId), {
              cache: "no-store",
            });
            const body = (await res.json().catch(() => ({}))) as {
              status?: { status?: string } | null;
              result?: unknown | null;
              hasLiveJob?: boolean;
            };
            stuck = orphanStuckFromFinalizePayload(body);
          } catch {
            /* treat as stuck */
          }
          setOrphanStuck(stuck);
          router.refresh();
          if (!stuck) setFinalizeGen((g) => g + 1);
        })();
      }, WIND_DOWN_ORPHAN_MS),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [windDownKey, router, finalizeGen]);

  const stuckIds = windDownKey ? windDownKey.split("\0").filter(Boolean) : [];

  return (
    <div style={{ marginTop: 12 }}>
      <div className="action-row">
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
        <span className="hint">
          {orphanStuck
            ? "Orphan cost-cap wind-down — settle the stuck leg"
            : stuckIds.length > 0
              ? "Sibling cost-cap wind-down — auto-settle after shared orphan timeout"
              : "Auto-refresh while Comparison catches up"}
        </span>
      </div>
      {stuckIds.length > 0 ? (
        <p className="hint" style={{ marginTop: 8 }}>
          {stuckIds.map((id, i) => (
            <span key={id}>
              {i > 0 ? " · " : null}
              <Link
                href={withPilotFocus(`/runs/${id}`, pilotFocus)}
                title="Open stuck sibling — Cancel or Refresh (heal)"
              >
                {orphanStuck
                  ? `Settle stuck leg ${id}`
                  : `Open wind-down leg ${id}`}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
