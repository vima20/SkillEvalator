"use client";

import { useState } from "react";

export default function NewRunPage() {
  const [evalSkillId, setEvalSkillId] = useState("code-debugging-eval");
  const [mode, setMode] = useState<"dry-run" | "official">("dry-run");
  const [repeats, setRepeats] = useState(1);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evalSkillId,
          mode,
          repeats: mode === "official" ? Math.max(repeats, 3) : repeats,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setMsg(`Queued ${data.runId}`);
      window.location.href = `/runs/${data.runId}`;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>New evaluation run</h1>
      <p style={{ color: "#444" }}>
        Pipeline: model produce → Docker grade vs expected. Dry-run uses{" "}
        <code>gpt-4o-mini</code>; official uses <code>gpt-4.1-mini</code> and ≥3
        repeats.
      </p>
      <form
        onSubmit={submit}
        style={{
          display: "grid",
          gap: 12,
          maxWidth: 480,
          padding: 16,
          border: "1px solid #d9d3c7",
          background: "#fffdf8",
        }}
      >
        <label>
          Eval skill
          <select
            value={evalSkillId}
            onChange={(e) => setEvalSkillId(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          >
            <option value="code-debugging-eval">code-debugging-eval</option>
          </select>
        </label>
        <label>
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "dry-run" | "official")}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          >
            <option value="dry-run">dry-run</option>
            <option value="official">official</option>
          </select>
        </label>
        <label>
          Repeats
          <input
            type="number"
            min={1}
            max={10}
            value={repeats}
            onChange={(e) => setRepeats(Number(e.target.value))}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Queueing…" : "Start run"}
        </button>
      </form>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
