"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClearSmokeNoise() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function onClear() {
    if (busy) return;
    const ok = window.confirm(
      "Delete smoke harness noise now?\n\nRemoves: evaluation.smoke plants and FAKE_PRODUCE runs (and their eval_* when both legs are smoke/fake).\nKept: attested live official legs (produceAttested), queued/running jobs.\nMixed smoke+live pairs are left untouched.",
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    setError(false);
    try {
      const res = await fetch("/api/runs/cleanup", {
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
      router.refresh();
    } catch (e) {
      setError(true);
      setMsg(e instanceof Error ? e.message : "smoke cleanup failed");
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
        title="Remove FAKE_PRODUCE / smoke:paired / smoke:official plants"
      >
        {busy ? "Clearing…" : "Clear smoke noise"}
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
