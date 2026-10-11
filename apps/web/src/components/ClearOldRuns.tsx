"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClearOldRuns() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function onClear() {
    if (busy) return;
    const ok = window.confirm(
      "Delete terminal runs older than 7 days? Queued/running jobs are kept.",
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    setError(false);
    try {
      const res = await fetch("/api/runs/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ olderThanDays: 7 }),
      });
      const data = (await res.json()) as {
        error?: string;
        removedCount?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "cleanup failed");
      setMsg(`Removed ${data.removedCount ?? 0} old run(s).`);
      router.refresh();
    } catch (e) {
      setError(true);
      setMsg(e instanceof Error ? e.message : "cleanup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="clear-runs">
      <button
        type="button"
        className="btn btn-ghost btn-compact"
        disabled={busy}
        onClick={() => void onClear()}
      >
        {busy ? "Clearing…" : "Clear old runs (7d+)"}
      </button>
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
