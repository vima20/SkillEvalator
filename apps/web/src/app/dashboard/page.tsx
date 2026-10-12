import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import {
  RunsAutoRefresh,
  runIsActive,
} from "@/components/RunsAutoRefresh";
import { healOrphanStatuses } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

type Row = {
  runId: string;
  score: number | null;
  modelId: string;
  taskSetId: string;
  mode: string;
  githubUrl?: string;
  skillId: string;
  skillVersion: string;
  evaluationId?: string;
  role: string;
};

/** Same fixed task set + model → compare different skill implementations. */
function groupKey(r: Row): string {
  return `${r.taskSetId}||${r.modelId}`;
}

function implKey(r: Row): string {
  return `${r.skillId}||${r.skillVersion}`;
}

function mean(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export default function DashboardPage() {
  healOrphanStatuses();
  const allRuns = listRuns(resultsDir());
  const hasActive = allRuns.some((r) => runIsActive(r.status));
  // Leaderboard: candidate legs only (baseline is Comparison input, not a skill impl).
  const rows: Row[] = allRuns.flatMap((r) => {
    if (!r.result) return [];
    if ((r.result.role ?? "candidate") === "baseline") return [];
    return [
      {
        runId: r.runId,
        score: r.result.score,
        modelId: r.result.modelId,
        taskSetId: r.result.taskSetId,
        mode: r.result.mode,
        githubUrl: r.result.evalSkillGithubUrl,
        skillId: r.result.evalSkillId,
        skillVersion: r.result.evalSkillVersion,
        evaluationId: r.result.evaluationId,
        role: r.result.role ?? "candidate",
      },
    ];
  });

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = groupKey(r);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }

  const groupList = [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const scored = rows.filter((r) => r.score !== null);
  const avg =
    scored.length > 0
      ? scored.reduce((a, r) => a + (r.score as number), 0) / scored.length
      : null;

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · Overview</p>
          <h1>Dashboard</h1>
          <p>
            Candidate runs grouped by task set and model (skill version
            leaderboard). Baseline↔candidate lift lives under{" "}
            <Link href="/comparison">Comparison</Link>. Cross-model bake-off is
            out of scope for this MVP.
          </p>
        </div>
        <div className="page-header-actions">
          <RunsAutoRefresh hasActive={hasActive} />
        </div>
      </header>

      {rows.length > 0 ? (
        <div className="stat-strip stat-strip-3">
          <div className="stat">
            <span className="stat-label">Completed</span>
            <span className="stat-value">{rows.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Avg score</span>
            <span className="stat-value">
              {avg !== null ? avg.toFixed(2) : "—"}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Compare groups</span>
            <span className="stat-value">{groupList.length}</span>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No completed runs"
            body="Finish a dry-run or official evaluation to populate the dashboard."
            actionHref="/"
            actionLabel="Start a run"
          />
        </div>
      ) : (
        <div className="dashboard-groups">
          {groupList.map(([key, groupRows]) => {
            const head = groupRows[0]!;
            const sorted = [...groupRows].sort((a, b) => {
              const as = a.score ?? -1;
              const bs = b.score ?? -1;
              if (bs !== as) return bs - as;
              return a.runId.localeCompare(b.runId);
            });

            const byImpl = new Map<string, Row[]>();
            for (const r of sorted) {
              const k = implKey(r);
              const list = byImpl.get(k) ?? [];
              list.push(r);
              byImpl.set(k, list);
            }
            const implSummaries = [...byImpl.entries()]
              .map(([ik, implRows]) => {
                const sample = implRows[0]!;
                const scores = implRows
                  .map((r) => r.score)
                  .filter((s): s is number => s !== null);
                return {
                  key: ik,
                  skillId: sample.skillId,
                  skillVersion: sample.skillVersion,
                  githubUrl: sample.githubUrl,
                  runs: implRows.length,
                  avg: mean(scores),
                  best: scores.length > 0 ? Math.max(...scores) : null,
                };
              })
              .sort((a, b) => (b.best ?? -1) - (a.best ?? -1));

            const leader = implSummaries[0];
            const multiImpl = implSummaries.length > 1;
            const groupScored = sorted.filter((r) => r.score !== null);
            const groupAvg = mean(
              groupScored.map((r) => r.score as number),
            );

            return (
              <section key={key} className="panel report-section">
                <header className="group-header">
                  <div>
                    <p className="eyebrow">
                      {head.modelId} · {implSummaries.length} implementation
                      {implSummaries.length === 1 ? "" : "s"}
                    </p>
                    <h2>
                      Task set <code>{head.taskSetId}</code>
                    </h2>
                  </div>
                  <div className="group-stats">
                    <span>
                      {sorted.length} run{sorted.length === 1 ? "" : "s"}
                    </span>
                    <span>
                      avg {groupAvg !== null ? groupAvg.toFixed(2) : "—"}
                    </span>
                  </div>
                </header>

                {multiImpl ? (
                  <div className="impl-compare">
                    <p className="impl-compare-label">
                      Same task set — candidate skill version leaderboard
                    </p>
                    <ul className="impl-compare-list">
                      {implSummaries.map((impl, i) => {
                        const delta =
                          leader?.best !== null &&
                          leader?.best !== undefined &&
                          impl.best !== null
                            ? impl.best - leader.best
                            : null;
                        return (
                          <li
                            key={impl.key}
                            className={i === 0 ? "is-leader" : undefined}
                          >
                            <span className="impl-rank">#{i + 1}</span>
                            <span className="impl-name">
                              <code>{impl.skillId}</code>{" "}
                              <code>{impl.skillVersion}</code>
                            </span>
                            <span className="impl-score">
                              best{" "}
                              {impl.best !== null ? impl.best.toFixed(2) : "—"}
                              {i > 0 && delta !== null ? (
                                <span className="impl-delta">
                                  {" "}
                                  ({delta >= 0 ? "+" : ""}
                                  {delta.toFixed(2)} vs leader)
                                </span>
                              ) : null}
                            </span>
                            {impl.githubUrl ? (
                              <a
                                href={impl.githubUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                GitHub
                              </a>
                            ) : (
                              <span className="impl-muted">—</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="hint impl-single-hint">
                    Only one implementation in this group so far. Queue another
                    skill that shares task set <code>{head.taskSetId}</code> to
                    compare.
                  </p>
                )}

                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Implementation</th>
                        <th>Version</th>
                        <th>GitHub</th>
                        <th>Run</th>
                        <th>Mode</th>
                        <th>Score</th>
                        <th>Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => (
                        <tr key={r.runId}>
                          <td>
                            <code>{r.skillId}</code>
                          </td>
                          <td>
                            <code>{r.skillVersion}</code>
                          </td>
                          <td>
                            {r.githubUrl ? (
                              <a
                                href={r.githubUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                open
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <Link href={`/runs/${r.runId}`}>{r.runId}</Link>
                          </td>
                          <td>{r.mode}</td>
                          <td>
                            <strong>{r.score ?? "—"}</strong>
                          </td>
                          <td>
                            <Link
                              className="btn btn-ghost btn-compact"
                              href={`/benefit/${r.runId}`}
                            >
                              Benefit
                            </Link>
                            {r.evaluationId ? (
                              <>
                                {" "}
                                <Link
                                  className="btn btn-ghost btn-compact"
                                  href={`/comparison/${r.evaluationId}`}
                                >
                                  Comparison
                                </Link>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
