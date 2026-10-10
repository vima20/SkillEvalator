"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Mirrored from @skillevalator/core OFFICIAL_MIN_REPEATS (API re-normalizes). */
const OFFICIAL_MIN_REPEATS = 3;

type SkillOption = {
  id: string;
  githubUrl: string;
  taskSetId: string;
  dryRunCount: number;
  taskCount: number;
};

export default function NewRunPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [evalSkillId, setEvalSkillId] = useState("code-debugging-eval");
  const [mode, setMode] = useState<"dry-run" | "official">("dry-run");
  const [repeats, setRepeats] = useState(1);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data: { skills?: SkillOption[] }) => {
        if (cancelled) return;
        const list = data.skills ?? [];
        setSkills(list);
        if (list.length > 0 && !list.some((s) => s.id === evalSkillId)) {
          setEvalSkillId(list[0]!.id);
        }
      })
      .catch(() => {
        /* keep hardcoded fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = skills.find((s) => s.id === evalSkillId);

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
            {(skills.length > 0
              ? skills
              : [
                  {
                    id: "code-debugging-eval",
                    githubUrl: "",
                    taskSetId: "",
                    dryRunCount: 0,
                    taskCount: 0,
                  },
                ]
            ).map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="githubUrl">Skill GitHub URL</label>
          {selected?.githubUrl ? (
            <a
              id="githubUrl"
              className="url-field"
              href={selected.githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              {selected.githubUrl}
            </a>
          ) : (
            <input
              id="githubUrl"
              type="url"
              readOnly
              value=""
              placeholder="Loaded from skill manifest…"
            />
          )}
          <p className="hint">
            Source of truth for this skill (from{" "}
            <code>fixtures/manifest.json</code>).
          </p>
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
