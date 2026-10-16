"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, UnauthorizedError } from "@/lib/apiFetch";

export function ClearSmokeNoise() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 12_000);
    return () => window.clearTimeout(id);
  }, [armed]);

  async function onConfirm() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setError(false);
    try {
      const res = await apiFetch("/api/runs/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "smoke" }),
      });
      const data = (await res.json()) as {
        error?: string;
        removedCount?: number;
        removedEvaluationCount?: number;
        skippedCount?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "smoke cleanup failed");
      const runs = data.removedCount ?? 0;
      const evals = data.removedEvaluationCount ?? 0;
      const skipped = data.skippedCount ?? 0;
      setMsg(
        skipped > 0
          ? `Removed ${runs} run(s) + ${evals} eval(s); skipped ${skipped}.`
          : `Removed ${runs} run(s) + ${evals} eval(s).`,
      );
      setArmed(false);
      router.refresh();
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      setError(true);
      setMsg(e instanceof Error ? e.message : "smoke cleanup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="clear-runs">
      {!armed ? (
        <button
          type="button"
          className="btn btn-ghost btn-compact"
          disabled={busy}
          onClick={() => {
            setArmed(true);
            setMsg(null);
            setError(false);
          }}
          title="Remove FAKE_PRODUCE / smoke:paired / smoke:official plants"
        >
          Clear smoke noise
        </button>
      ) : (
        <div className="action-row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Clearing…" : "Confirm delete smoke"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            disabled={busy}
            onClick={() => setArmed(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {armed ? (
        <p className="hint" style={{ margin: "6px 0 0" }}>
          Removes evaluation.smoke plants and FAKE_PRODUCE runs. Keeps attested
          live official (produceAttested). Mixed smoke+live pairs untouched.
        </p>
      ) : null}
      {msg ? (
        <p
          className={error ? "form-error" : "clear-runs-ok"}
          role={error ? "alert" : "status"}
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
