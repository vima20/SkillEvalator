"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Mirrored from @skillevalator/core OFFICIAL_MIN_REPEATS (API re-normalizes). */
const OFFICIAL_MIN_REPEATS = 3;

export type SkillOption = {
  id: string;
  githubUrl: string;
  taskSetId: string;
  dryRunCount: number;
  taskCount: number;
};

export function NewRunForm({ skills }: { skills: SkillOption[] }) {
  const router = useRouter();
  const [evalSkillId, setEvalSkillId] = useState(
    skills[0]?.id ?? "code-debugging-eval",
  );
  const [mode, setMode] = useState<"dry-run" | "official">("dry-run");
  const [repeats, setRepeats] = useState(1);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = skills.find((s) => s.id === evalSkillId) ?? skills[0];
  const minRepeats = mode === "official" ? OFFICIAL_MIN_REPEATS : 1;

  function selectMode(next: "dry-run" | "official") {
    setMode(next);
    if (next === "official") {
      setRepeats((r) => Math.max(r, OFFICIAL_MIN_REPEATS));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError(false);
    const safeRepeats =
      mode === "official"
        ? Math.max(repeats, OFFICIAL_MIN_REPEATS)
        : Math.max(1, repeats);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evalSkillId,
          mode,
          repeats: safeRepeats,
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
    <div className="split">
      <form className="panel form-grid" onSubmit={submit}>
        <div className="field">
          <label htmlFor="evalSkillId">Eval skill</label>
          <select
            id="evalSkillId"
            value={evalSkillId}
            onChange={(e) => setEvalSkillId(e.target.value)}
          >
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="field-label" id="githubUrlLabel">
            Skill GitHub URL
          </span>
          {selected?.githubUrl ? (
            <a
              className="url-field"
              href={selected.githubUrl}
              target="_blank"
              rel="noreferrer"
              aria-labelledby="githubUrlLabel"
            >
              {selected.githubUrl}
            </a>
          ) : (
            <div
              className="url-field url-field-muted"
              aria-labelledby="githubUrlLabel"
            >
              No GitHub URL in skill manifest
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label" id="modeLabel">
            Mode
          </span>
          <div
            className="segmented"
            role="radiogroup"
            aria-labelledby="modeLabel"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === "dry-run"}
              className={mode === "dry-run" ? "is-active" : undefined}
              onClick={() => selectMode("dry-run")}
            >
              dry-run
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "official"}
              className={mode === "official" ? "is-active" : undefined}
              onClick={() => selectMode("official")}
            >
              official
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="repeats">Repeats</label>
          <input
            id="repeats"
            type="number"
            min={minRepeats}
            max={10}
            value={repeats}
            onChange={(e) => setRepeats(Number(e.target.value))}
          />
          {mode === "official" ? (
            <p className="hint">
              Official mode requires at least {OFFICIAL_MIN_REPEATS} repeats
              (enforced in UI and API).
            </p>
          ) : null}
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Queueing…" : "Start run"}
        </button>
        {msg ? (
          <p
            className={`msg${error ? " error" : ""}`}
            role={error ? "alert" : "status"}
            aria-live="polite"
          >
            {msg}
          </p>
        ) : null}
      </form>

      <aside className="panel skill-card">
        <p className="eyebrow">Selected skill</p>
        <h2>{selected?.id ?? evalSkillId}</h2>
        <p className="skill-card-body">
          Pipeline: model produce → Docker/host grade (script vs fixtures /
          subject).
        </p>
        <dl className="meta-list">
          <div>
            <dt>Task set</dt>
            <dd>
              <code>{selected?.taskSetId ?? "—"}</code>
            </dd>
          </div>
          <div>
            <dt>Dry-run tasks</dt>
            <dd>{selected?.dryRunCount ?? "—"}</dd>
          </div>
          <div>
            <dt>Official tasks</dt>
            <dd>{selected?.taskCount ?? "—"}</dd>
          </div>
        </dl>
        {selected?.githubUrl ? (
          <a
            className="btn btn-ghost"
            href={selected.githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open on GitHub
          </a>
        ) : null}
      </aside>
    </div>
  );
}
