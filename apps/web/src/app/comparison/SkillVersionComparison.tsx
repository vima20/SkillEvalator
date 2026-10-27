"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  compareSkillVersionRuns,
  compatibleNewVersionRuns,
  defaultSkillVersionPair,
  oldVersionRunOptions,
  skillVersionRunComparisonBlockers,
  type SkillVersionRun,
} from "@/lib/skillVersionComparison";

function label(run: SkillVersionRun) {
  const time = new Date(run.startedAt);
  const date = Number.isNaN(time.getTime()) ? run.startedAt : time.toLocaleString();
  return `${date} · ${run.skillVersion.slice(0, 12)} · ${run.runId} · ${run.score === null ? "no score" : run.score.toFixed(3)}`;
}

export function SkillVersionComparison({ runs }: { runs: SkillVersionRun[] }) {
  const skillIds = useMemo(() => [...new Set(runs.map((run) => run.skillId))].sort(), [runs]);
  const [skillId, setSkillId] = useState(skillIds[0] ?? "");
  const availableRuns = useMemo(
    () => runs.filter((run) => run.skillId === skillId),
    [runs, skillId],
  );
  const initialPair = useMemo(() => defaultSkillVersionPair(availableRuns), [availableRuns]);
  const [oldRunId, setOldRunId] = useState(initialPair.oldId);
  const [newRunId, setNewRunId] = useState(initialPair.newId);
  const oldRun = availableRuns.find((run) => run.runId === oldRunId) ?? null;
  const newOptions = oldRun ? compatibleNewVersionRuns(oldRun, availableRuns) : [];
  const newRun = newOptions.find((run) => run.runId === newRunId) ?? null;
  const oldOptions = oldVersionRunOptions(availableRuns);
  const comparisonBlockers = useMemo(
    () => skillVersionRunComparisonBlockers(availableRuns),
    [availableRuns],
  );

  useEffect(() => {
    const nextSkillId = skillIds.includes(skillId) ? skillId : skillIds[0] ?? "";
    const nextRuns = runs.filter((run) => run.skillId === nextSkillId);
    if (nextSkillId !== skillId) setSkillId(nextSkillId);

    const selectedOldRun = nextRuns.find((run) => run.runId === oldRunId);
    if (!selectedOldRun) {
      const nextPair = defaultSkillVersionPair(nextRuns);
      if (oldRunId !== nextPair.oldId) setOldRunId(nextPair.oldId);
      if (newRunId !== nextPair.newId) setNewRunId(nextPair.newId);
      return;
    }

    const compatibleRuns = compatibleNewVersionRuns(selectedOldRun, nextRuns);
    if (!compatibleRuns.some((run) => run.runId === newRunId)) {
      const nextNewRunId = compatibleRuns[0]?.runId ?? "";
      if (newRunId !== nextNewRunId) setNewRunId(nextNewRunId);
    }
  }, [runs, skillIds, skillId, oldRunId, newRunId]);

  const comparison = oldRun && newRun ? compareSkillVersionRuns(oldRun, newRun) : null;
  const taskStatuses = useMemo(
    () => ({
      old: new Map(oldRun?.perTask.map((task) => [task.taskId, task.status]) ?? []),
      new: new Map(newRun?.perTask.map((task) => [task.taskId, task.status]) ?? []),
    }),
    [oldRun, newRun],
  );
  const taskOutcomeSummary = comparison?.tasks.reduce(
    (summary, task) => {
      const oldStatus = taskStatuses.old.get(task.taskId);
      const newStatus = taskStatuses.new.get(task.taskId);
      if (oldStatus === newStatus) {
        summary.unchanged += 1;
      } else if (oldStatus === "failed" && newStatus === "ok") {
        summary.recovered += 1;
      } else if (oldStatus === "ok" && newStatus === "failed") {
        summary.newFailures += 1;
      } else {
        summary.otherChanges += 1;
      }
      return summary;
    },
    { recovered: 0, newFailures: 0, otherChanges: 0, unchanged: 0 },
  );
  const delta = comparison?.scoreDelta ?? null;

  return (
    <section className="panel skill-version-compare" aria-labelledby="skill-version-compare-title">
      <div className="skill-version-compare-heading">
        <div>
          <p className="eyebrow">Same skill · version history</p>
          <h2 id="skill-version-compare-title">Compare skill versions</h2>
          <p>Compare saved candidate runs for the same skill, task set, and model.</p>
        </div>
        <span className="role-chip">Descriptive · not adoption evidence</span>
      </div>

      {runs.length === 0 ? (
        <div>
          <p className="hint">
            No completed live candidate runs yet. Smoke/fake and unattested runs are excluded. To compare versions, run the skill once before editing and again after editing. Use the same model, mode, task set, and run settings; a baseline pair is optional.
          </p>
          <Link className="btn btn-primary btn-compact" href="/">
            Start a run
          </Link>
        </div>
      ) : (
        <>
          <div className="skill-version-compare-fields">
            <label className="field">
              <span>Skill</span>
              <select
                value={skillId}
                onChange={(event) => {
                  const nextSkillId = event.target.value;
                  const nextRuns = runs.filter((run) => run.skillId === nextSkillId);
                  const nextPair = defaultSkillVersionPair(nextRuns);
                  setSkillId(nextSkillId);
                  setOldRunId(nextPair.oldId);
                  setNewRunId(nextPair.newId);
                }}
              >
                {skillIds.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Old version run</span>
              <select
                value={oldRunId}
                onChange={(event) => {
                  const nextOldId = event.target.value;
                  const nextOld = availableRuns.find((run) => run.runId === nextOldId);
                  const nextNew = nextOld
                    ? compatibleNewVersionRuns(nextOld, availableRuns)[0]
                    : undefined;
                  setOldRunId(nextOldId);
                  setNewRunId(nextNew?.runId ?? "");
                }}
                disabled={oldOptions.length === 0}
              >
                {oldOptions.map((run) => <option key={run.runId} value={run.runId}>{label(run)}</option>)}
              </select>
            </label>
            <label className="field">
              <span>New version run</span>
              <select
                value={newRunId}
                onChange={(event) => setNewRunId(event.target.value)}
                disabled={newOptions.length === 0}
              >
                {newOptions.map((run) => <option key={run.runId} value={run.runId}>{label(run)}</option>)}
              </select>
            </label>
          </div>

          {oldOptions.length === 0 ? (
            <div>
              <p className="hint">
                No two different versions have compatible completed runs for this skill. Keep its current run, edit the skill, then start another live run with the same model, mode, task set, and run settings. Single candidate runs are enough; smoke/fake runs are ignored.
              </p>
              {comparisonBlockers.length > 0 ? (
                <div className="hint skill-version-blockers" aria-live="polite">
                  <strong>Why the available runs cannot be compared:</strong>
                  <ul>
                    {comparisonBlockers.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
              ) : null}
              <Link className="btn btn-primary btn-compact" href="/">
                Start a run
              </Link>
            </div>
          ) : newRun ? (
            <>
              <div className="skill-version-summary">
                <div>
                  <span>Old</span>
                  <strong title={oldRun?.skillVersion}>{oldRun?.skillVersion.slice(0, 12)}</strong>
                  <small>{oldRun?.runId}</small>
                  <small title={oldRun?.sourceCommit ?? undefined}>Commit {oldRun?.sourceCommit?.slice(0, 12) ?? "not recorded"}</small>
                  {oldRun?.sourceUrl ? <a href={oldRun.sourceUrl} target="_blank" rel="noreferrer">GitHub source</a> : null}
                </div>
                <div>
                  <span>New</span>
                  <strong title={newRun.skillVersion}>{newRun.skillVersion.slice(0, 12)}</strong>
                  <small>{newRun.runId}</small>
                  <small title={newRun.sourceCommit ?? undefined}>Commit {newRun.sourceCommit?.slice(0, 12) ?? "not recorded"}</small>
                  {newRun.sourceUrl ? <a href={newRun.sourceUrl} target="_blank" rel="noreferrer">GitHub source</a> : null}
                </div>
                <div><span>Score change</span><strong className={delta === null ? "" : delta >= 0 ? "score-up" : "score-down"}>{delta === null ? "—" : `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} pp`}</strong><small>{oldRun?.score?.toFixed(3) ?? "—"} → {newRun.score?.toFixed(3) ?? "—"}</small></div>
                <div>
                  <span>Repeat stability</span>
                  <strong>{oldRun?.repeats ?? "—"} → {newRun.repeats} repeats</strong>
                  <small>
                    Repeat SD: {oldRun?.scoreSpread?.toFixed(3) ?? "n/a"} → {newRun.scoreSpread?.toFixed(3) ?? "n/a"} · lower is steadier
                  </small>
                </div>
              </div>
              {taskOutcomeSummary ? (
                <p className="hint" aria-live="polite">
                  Task status changes: {taskOutcomeSummary.recovered} recovered · {taskOutcomeSummary.newFailures} newly failed · {taskOutcomeSummary.otherChanges} other changes · {taskOutcomeSummary.unchanged} unchanged.
                </p>
              ) : null}
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Task</th><th>Status (old → new)</th><th>Old score</th><th>New score</th><th>Change</th></tr></thead>
                  <tbody>
                    {comparison?.tasks.map((task) => {
                      const change = task.scoreDelta;
                      const oldStatus = taskStatuses.old.get(task.taskId) ?? "—";
                      const newStatus = taskStatuses.new.get(task.taskId) ?? "—";
                      return <tr key={task.taskId}>
                        <td><code>{task.taskId}</code></td>
                        <td>{oldStatus} → {newStatus}</td>
                        <td>{task.oldScore === null ? "—" : task.oldScore.toFixed(3)}</td>
                        <td>{task.newScore === null ? "—" : task.newScore.toFixed(3)}</td>
                        <td className={change === null ? "" : change > 0 ? "score-up" : change < 0 ? "score-down" : ""}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)} pp`}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <p className="hint">
                Repeat SD is the standard deviation across repeats; it is shown only when the run recorded it. Runs are matched on model <code>{newRun.modelId}</code>, task set, repeats, decoding, grader, and produce type. This historical run comparison does not create an official adoption PASS.
              </p>
              <details className="skill-version-settings">
                <summary>Matched run settings</summary>
                <dl className="skill-version-settings-grid">
                  <div><dt>Model</dt><dd><code>{newRun.modelId}</code></dd></div>
                  <div><dt>Task set</dt><dd><code>{newRun.taskSetId}</code></dd></div>
                  <div><dt>Tasks</dt><dd>{newRun.taskIds.map((taskId) => <code key={taskId}>{taskId}</code>)}</dd></div>
                  <div><dt>Mode</dt><dd>{newRun.mode}</dd></div>
                  <div><dt>Grader</dt><dd>{newRun.grade} · <code title={newRun.gradeHash}>{newRun.gradeHash ? newRun.gradeHash.slice(0, 12) : "unknown"}</code></dd></div>
                  <div><dt>Repeats</dt><dd>{newRun.repeats}</dd></div>
                  <div><dt>Temperature</dt><dd>{newRun.temperature}</dd></div>
                  <div><dt>Top P</dt><dd>{newRun.topP}</dd></div>
                  <div><dt>Seed</dt><dd>{newRun.seed ?? "—"}</dd></div>
                  <div><dt>Max output tokens</dt><dd>{newRun.maxOutputTokens ?? "—"}</dd></div>
                  <div><dt>Produce</dt><dd>Live, attested</dd></div>
                </dl>
              </details>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
