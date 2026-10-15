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
      "Delete terminal runs older than 7 days?\n\nKept: queued/running, official mode, and Comparison-linked baseline/candidate legs (eval_* archive).",
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    setError(false);
    try {
      const res = await fetch("/api/runs/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "age", olderThanDays: 7 }),
      });
      const data = (await res.json()) as {
        error?: string;
        removedCount?: number;
        skippedCount?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "cleanup failed");
      const skipped = data.skippedCount ?? 0;
      setMsg(
        skipped > 0
          ? `Removed ${data.removedCount ?? 0} old run(s); kept ${skipped} official/linked.`
          : `Removed ${data.removedCount ?? 0} old run(s).`,
      );
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
