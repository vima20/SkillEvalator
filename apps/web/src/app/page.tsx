"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Mirrored from @skillevalator/core OFFICIAL_MIN_REPEATS (API re-normalizes). */
const OFFICIAL_MIN_REPEATS = 3;

export default function NewRunPage() {
  const router = useRouter();
  const [evalSkillId, setEvalSkillId] = useState("code-debugging-eval");
  const [mode, setMode] = useState<"dry-run" | "official">("dry-run");
  const [repeats, setRepeats] = useState(1);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError(false);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evalSkillId,
          mode,
          repeats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setMsg(`Queued ${data.runId}`);
      router.push(`/runs/${data.runId}`);
    } catch (err) {
      setError(true);
      setMsg(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="page-header">
        <h1>New evaluation run</h1>
        <p>
          Produce with the model, then grade against expected fixtures in Docker.
          Dry-run uses <code>gpt-4o-mini</code>; official uses{" "}
          <code>gpt-4.1-mini</code> with at least {OFFICIAL_MIN_REPEATS} repeats.
        </p>
      </header>

      <form className="panel form-grid" onSubmit={submit}>
        <div className="field">
          <label htmlFor="evalSkillId">Eval skill</label>
          <select
            id="evalSkillId"
            value={evalSkillId}
            onChange={(e) => setEvalSkillId(e.target.value)}
          >
            <option value="code-debugging-eval">code-debugging-eval</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="mode">Mode</label>
          <select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "dry-run" | "official")}
          >
            <option value="dry-run">dry-run</option>
            <option value="official">official</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="repeats">Repeats</label>
          <input
            id="repeats"
            type="number"
            min={1}
            max={10}
            value={repeats}
            onChange={(e) => setRepeats(Number(e.target.value))}
          />
          {mode === "official" ? (
            <p className="hint">
              Official mode enforces a minimum of {OFFICIAL_MIN_REPEATS} repeats.
            </p>
          ) : null}
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Queueing…" : "Start run"}
        </button>
      </form>

      {msg ? <p className={`msg${error ? " error" : ""}`}>{msg}</p> : null}
    </div>
  );
}
