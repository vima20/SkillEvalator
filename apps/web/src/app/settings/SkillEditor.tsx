"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import type { SettingsSkillRow } from "@/lib/settingsTypes";

type EditorTask = {
  taskId: string;
  targetFile: string;
  tests: { filename: string; content: string }[];
  expected: string | null;
};

type EditorDocument = {
  skillId: string;
  skillMd: string;
  gradeScript: string | null;
  taskSetId: string;
  sharedTaskSet: boolean;
  tasks: EditorTask[];
};

export function SkillEditor(opts: { skills: SettingsSkillRow[] }) {
  const [skillId, setSkillId] = useState(opts.skills[0]?.id ?? "");
  const [document, setDocument] = useState<EditorDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!skillId) {
      setDocument(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSaved(false);
    setDirty(false);
    void apiFetch(`/api/skills/editor?skillId=${encodeURIComponent(skillId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as EditorDocument & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Could not load skill editor");
        setDocument(body);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load skill editor");
        setDocument(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [skillId]);

  function updateTask(taskId: string, update: (task: EditorTask) => EditorTask) {
    setDocument((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) =>
              task.taskId === taskId ? update(task) : task,
            ),
          }
        : current,
    );
    setSaved(false);
    setDirty(true);
  }

  async function save() {
    if (!document) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch("/api/skills/editor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(document),
      });
      const body = (await res.json()) as
        | { ok: true; document: EditorDocument }
        | { error?: string };
      if (!res.ok || !("ok" in body) || !body.ok) {
        throw new Error("error" in body ? body.error ?? "Could not save" : "Could not save");
      }
      setDocument(body.document);
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save skill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="settings-panel-head">
        <h2>Prompt &amp; evaluation criteria</h2>
        <button
          type="button"
          className="btn btn-primary btn-compact"
          onClick={() => void save()}
          disabled={!document || loading || saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
      <p className="hint">
        Edit the selected skill’s <code>SKILL.md</code> prompt and the actual
        per-task grading tests and golden files. New runs use the saved files;
        existing runs keep their pinned snapshot. The neutral baseline prompt
        remains fixed so paired comparisons keep the same reference.
      </p>
      <label className="field settings-editor-skill">
        <span>Skill</span>
        <select
          value={skillId}
          onChange={(event) => {
            if (dirty && !window.confirm("Discard unsaved prompt or criteria changes?")) {
              return;
            }
            setSkillId(event.target.value);
          }}
          disabled={loading || saving || opts.skills.length === 0}
        >
          {opts.skills.map((skill) => (
            <option key={`${skill.source}:${skill.id}`} value={skill.id}>
              {skill.id} · {skill.taskSetId}
            </option>
          ))}
        </select>
      </label>

      {document?.sharedTaskSet ? (
        <p className="settings-editor-warning" role="note">
          These criteria use shared task set <code>{document.taskSetId}</code>.
          Editing tests or golden files changes grading for every skill using
          this task set. Keep criteria unchanged when comparing archived runs.
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {saved ? <p className="badge badge-ok" role="status">Saved. Start a new run to use these changes.</p> : null}
      {loading ? <p className="hint">Loading prompt and criteria…</p> : null}

      {document ? (
        <>
          <label className="field settings-editor-field">
            <span>Skill prompt · SKILL.md</span>
            <textarea
              rows={14}
              spellCheck={false}
              value={document.skillMd}
              onChange={(event) => {
                setDocument({ ...document, skillMd: event.target.value });
                setSaved(false);
                setDirty(true);
              }}
            />
          </label>
          <div className="settings-editor-criteria">
            <h3>Evaluation criteria</h3>
            <p className="hint">
              Tests decide pass or fail. The expected file is also used for
              golden-diff scoring. The grader script runs those tests. Changing
              these files changes the grading basis.
            </p>
            {document.gradeScript !== null ? (
              <label className="field settings-editor-field">
                <span>Grader · scripts/grade.js</span>
                <textarea
                  rows={14}
                  spellCheck={false}
                  value={document.gradeScript}
                  onChange={(event) => {
                    setDocument({ ...document, gradeScript: event.target.value });
                    setSaved(false);
                    setDirty(true);
                  }}
                />
              </label>
            ) : null}
            {document.tasks.map((task) => (
              <details className="settings-editor-task" key={task.taskId}>
                <summary>
                  <code>{task.taskId}</code> <span>{task.targetFile}</span>
                </summary>
                <div className="settings-editor-task-body">
                  {task.tests.map((test) => (
                    <label className="field settings-editor-field" key={test.filename}>
                      <span>Test · {test.filename}</span>
                      <textarea
                        rows={10}
                        spellCheck={false}
                        value={test.content}
                        onChange={(event) =>
                          updateTask(task.taskId, (current) => ({
                            ...current,
                            tests: current.tests.map((entry) =>
                              entry.filename === test.filename
                                ? { ...entry, content: event.target.value }
                                : entry,
                            ),
                          }))
                        }
                      />
                    </label>
                  ))}
                  {task.expected !== null ? (
                    <label className="field settings-editor-field">
                      <span>Golden expected output · {task.targetFile}</span>
                      <textarea
                        rows={10}
                        spellCheck={false}
                        value={task.expected}
                        onChange={(event) =>
                          updateTask(task.taskId, (current) => ({
                            ...current,
                            expected: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : (
                    <p className="hint">No golden expected file for this task.</p>
                  )}
                </div>
              </details>
            ))}
          </div>
          <div className="settings-editor-footer">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={loading || saving}
            >
              {saving ? "Saving…" : "Save prompt &amp; criteria"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
