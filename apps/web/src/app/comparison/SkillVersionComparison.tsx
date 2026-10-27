"use client";

import { useMemo, useState } from "react";

export type SkillVersionRun = {
  runId: string;
  skillId: string;
  skillVersion: string;
  taskSetId: string;
  taskIds: string[];
  modelId: string;
  mode: "dry-run" | "official";
  grade: "docker_script" | "host_script";
  gradeHash: string;
  fakeProduce: boolean;
  repeats: number;
  temperature: number;
  topP: number;
  seed: number | null;
  maxOutputTokens: number | null;
  score: number | null;
  startedAt: string;
  perTask: Array<{ taskId: string; score: number | null; status: string }>;
};

function sameTaskIds(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
}

function compatible(a: SkillVersionRun, b: SkillVersionRun) {
  return (
    a.runId !== b.runId &&
    a.skillId === b.skillId &&
    a.taskSetId === b.taskSetId &&
    a.modelId === b.modelId &&
    a.mode === b.mode &&
    a.grade === b.grade &&
    a.gradeHash === b.gradeHash &&
    a.fakeProduce === b.fakeProduce &&
    a.repeats === b.repeats &&
    a.temperature === b.temperature &&
    a.topP === b.topP &&
    a.seed === b.seed &&
    a.maxOutputTokens === b.maxOutputTokens &&
    sameTaskIds(a.taskIds, b.taskIds)
  );
}

function isLaterRun(oldRun: SkillVersionRun, newRun: SkillVersionRun) {
  return Date.parse(newRun.startedAt) > Date.parse(oldRun.startedAt);
}

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
  const initialPair = useMemo(() => {
    for (let newerIndex = 0; newerIndex < availableRuns.length; newerIndex += 1) {
      const newer = availableRuns[newerIndex]!;
      for (let olderIndex = newerIndex + 1; olderIndex < availableRuns.length; olderIndex += 1) {
        const older = availableRuns[olderIndex]!;
        if (older.skillVersion !== newer.skillVersion && compatible(older, newer) && isLaterRun(older, newer)) {
          return { oldId: older.runId, newId: newer.runId };
        }
      }
    }
    return { oldId: availableRuns[0]?.runId ?? "", newId: "" };
  }, [availableRuns]);
  const [oldRunId, setOldRunId] = useState(initialPair.oldId);
  const [newRunId, setNewRunId] = useState(initialPair.newId);
  const oldRun = availableRuns.find((run) => run.runId === oldRunId) ?? null;
  const newOptions = oldRun
    ? availableRuns.filter(
        (run) => run.skillVersion !== oldRun.skillVersion && compatible(oldRun, run) && isLaterRun(oldRun, run),
      )
    : [];
  const newRun = newOptions.find((run) => run.runId === newRunId) ?? null;
  const oldOptions = availableRuns.filter((run) =>
    availableRuns.some(
      (other) => other.skillVersion !== run.skillVersion && compatible(run, other) && isLaterRun(run, other),
    ),
  );
  const delta = oldRun && newRun && oldRun.score !== null && newRun.score !== null
    ? newRun.score - oldRun.score
    : null;
  const oldTasks = new Map(oldRun?.perTask.map((task) => [task.taskId, task]) ?? []);

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
        <p className="hint">
          No completed live candidate runs yet. Smoke/fake and unattested runs are excluded. Run the skill before and after editing it; each run keeps its own version snapshot.
        </p>
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
                  setSkillId(nextSkillId);
                  setOldRunId(nextRuns[0]?.runId ?? "");
                  setNewRunId("");
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
                    ? availableRuns.find((run) => run.skillVersion !== nextOld.skillVersion && compatible(nextOld, run) && isLaterRun(nextOld, run))
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
            <p className="hint">
              No two different versions have compatible completed runs. Keep an old run, edit the skill, then start a new candidate run with the same model and task set.
            </p>
          ) : newRun ? (
            <>
              <div className="skill-version-summary">
                <div><span>Old</span><strong title={oldRun?.skillVersion}>{oldRun?.skillVersion.slice(0, 12)}</strong><small>{oldRun?.runId}</small></div>
                <div><span>New</span><strong title={newRun.skillVersion}>{newRun.skillVersion.slice(0, 12)}</strong><small>{newRun.runId}</small></div>
                <div><span>Score change</span><strong className={delta === null ? "" : delta >= 0 ? "score-up" : "score-down"}>{delta === null ? "—" : `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} pp`}</strong><small>{oldRun?.score?.toFixed(3) ?? "—"} → {newRun.score?.toFixed(3) ?? "—"}</small></div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Task</th><th>Old score</th><th>New score</th><th>Change</th></tr></thead>
                  <tbody>
                    {newRun.perTask.map((task) => {
                      const previous = oldTasks.get(task.taskId)?.score ?? null;
                      const change = previous !== null && task.score !== null ? task.score - previous : null;
                      return <tr key={task.taskId}>
                        <td><code>{task.taskId}</code></td>
                        <td>{previous === null ? "—" : previous.toFixed(3)}</td>
                        <td>{task.score === null ? "—" : task.score.toFixed(3)}</td>
                        <td className={change === null ? "" : change > 0 ? "score-up" : change < 0 ? "score-down" : ""}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)} pp`}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <p className="hint">
                Matched on model <code>{newRun.modelId}</code>, task set, repeats, decoding, grader, and produce type. This historical run comparison does not create an official adoption PASS.
              </p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
