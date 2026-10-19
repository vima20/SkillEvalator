"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import {
  runDetailFinalizeOrphansPath,
  WIND_DOWN_ORPHAN_MS,
} from "@/lib/runLifecycle";
import {
  benefitPendingState,
  orphanStuckFromFinalizePayload,
} from "@/lib/status";

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
  /** Re-arm 90s finalize while a live job is still finishing. */
  const [finalizeGen, setFinalizeGen] = useState(0);

  const { windDown, stillWaiting, unavailable, orphanStuck } =
    benefitPendingState({
      status,
      budgetTimedOut,
    });

  useEffect(() => {
    if (!windDown) {
      setBudgetTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => {
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
          /* treat as stuck so Cancel/heal path is offered */
        }
        setBudgetTimedOut(stuck);
        router.refresh();
        if (!stuck) setFinalizeGen((g) => g + 1);
      })();
    }, WIND_DOWN_ORPHAN_MS);
    return () => window.clearTimeout(id);
  }, [windDown, runId, router, finalizeGen]);

  // Poll while waiting OR orphanStuck — external heal (run detail / list) must
  // clear stale stuck UI without a hard reload (ComparisonPending parity).
  useEffect(() => {
    if (!stillWaiting && !orphanStuck) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [router, stillWaiting, orphanStuck]);

  const cancelWindDown = status === "cancel_requested";
  const pageHeading = orphanStuck
    ? cancelWindDown
      ? "Cancel stuck"
      : "Cost-cap wind-down stuck"
    : unavailable
      ? "Benefit unavailable"
      : windDown
        ? cancelWindDown
          ? "Cancel in progress"
          : "Writing final result"
        : "Report not ready";

  return (
    <>
      <h1 style={{ marginBottom: 16 }}>{pageHeading}</h1>
      <div className="panel">
      <div className="empty-state">
        <div className="empty-state-mark" aria-hidden="true" />
        <h2>
          {orphanStuck
            ? cancelWindDown
              ? "Cancel stuck"
              : "Cost-cap wind-down stuck"
            : unavailable
              ? "Benefit unavailable"
              : windDown
                ? cancelWindDown
                  ? "Cancel in progress"
                  : "Writing final result"
                : "No result yet"}
        </h2>
        <p>
          {orphanStuck
            ? cancelWindDown
              ? "Cancel never finished (worker may be gone). Open the run → Resend cancel or Refresh (heal). Retry unlocks after settle — same as run detail."
              : "This run hit COST_CAP_USD and never wrote result.json. Open the run → Cancel or Refresh (heal). Retry stays blocked until result.json exists — same as run detail."
            : unavailable
              ? `This run ended as ${status ?? "unknown"} without a result.json, so a Benefit Report cannot be built. Open the run for status details.`
              : windDown
                ? cancelWindDown
                  ? "Cancel was requested and this page refreshes automatically (stops after the shared orphan timeout if the worker is stuck)."
                  : "Cost hard-stop is writing the final result.json. This page refreshes automatically (stops after the shared orphan timeout if the worker is stuck)."
                : "This run has no result.json yet. Waiting for the worker — this page refreshes automatically."}
        </p>
        <div className="action-row" style={{ marginTop: 14 }}>
          {stillWaiting || orphanStuck ? (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void (async () => {
                  if (orphanStuck) {
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
                      /* keep stuck */
                    }
                    setBudgetTimedOut(stuck);
                    if (!stuck) setFinalizeGen((g) => g + 1);
                  }
                  router.refresh();
                  window.setTimeout(() => setBusy(false), 400);
                })();
              }}
            >
              {busy ? "Refreshing…" : "Refresh now"}
            </button>
          ) : null}
          <Link
            className="btn btn-primary btn-compact"
            href={withPilotFocus(`/runs/${runId}`, pilotFocus)}
          >
            {orphanStuck
              ? "Open run — Cancel / Resend cancel"
              : "Open run"}
          </Link>
        </div>
      </div>
      </div>
    </>
  );
}
