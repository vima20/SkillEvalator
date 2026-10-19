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
 * Comparison lands. Orphan wind-down siblings (budget_stop / cancel_requested)
 * get the same 90s finalize as ComparisonPending / RunsAutoRefresh.
 */
export function BenefitPairWaitingRefresh({
  windDownRunIds = [],
  pilotFocus = false,
}: {
  /** Tip legs in budget_stop / cancel_requested without result.json. */
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
    // One shared window + aggregate stuck (not per-id setOrphanStuck races).
    const timer = window.setTimeout(() => {
      void (async () => {
        let stillStuck = false;
        let rearm = false;
        await Promise.all(
          ids.map(async (runId) => {
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
            if (stuck) stillStuck = true;
            else rearm = true;
          }),
        );
        setOrphanStuck(stillStuck);
        router.refresh();
        if (rearm) setFinalizeGen((g) => g + 1);
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(timer);
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
            void (async () => {
              // Copy promises "Refresh (heal)" when orphanStuck — match
              // ComparisonPending / BenefitPending / run detail Refresh.
              if (orphanStuck && stuckIds.length > 0) {
                let stillStuck = false;
                let rearm = false;
                for (const runId of stuckIds) {
                  let stuck = true;
                  try {
                    const res = await apiFetch(
                      runDetailFinalizeOrphansPath(runId),
                      { cache: "no-store" },
                    );
                    const body = (await res.json().catch(() => ({}))) as {
                      status?: { status?: string } | null;
                      result?: unknown | null;
                      hasLiveJob?: boolean;
                    };
                    stuck = orphanStuckFromFinalizePayload(body);
                  } catch {
                    /* treat as stuck */
                  }
                  if (stuck) stillStuck = true;
                  else rearm = true;
                }
                setOrphanStuck(stillStuck);
                if (rearm) setFinalizeGen((g) => g + 1);
              }
              router.refresh();
              window.setTimeout(() => setBusy(false), 400);
            })();
          }}
        >
          {busy ? "Refreshing…" : "Refresh now"}
        </button>
        <span className="hint">
          {orphanStuck
            ? "Orphan wind-down stuck — Cancel / Resend cancel or Refresh (heal)"
            : stuckIds.length > 0
              ? "Sibling cost-cap or cancel wind-down — auto-settle after shared orphan timeout"
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
                title="Open sibling — Cancel / Resend cancel or Refresh (heal)"
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
