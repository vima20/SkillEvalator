import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
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
};

function groupKey(r: Row): string {
  return `${r.skillId}||${r.taskSetId}||${r.modelId}`;
}

export default function DashboardPage() {
  const rows: Row[] = listRuns(resultsDir()).flatMap((r) => {
    if (!r.result) return [];
    return [
      {
        runId: r.runId,
        score: r.result.score,
        modelId: r.result.modelId,
        taskSetId: r.result.taskSetId,
        mode: r.result.mode,
        githubUrl: r.result.evalSkillGithubUrl,
        skillId: r.result.evalSkillId,
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
      <header className="page-header">
        <p className="eyebrow">Unikie · Overview</p>
        <h1>Dashboard</h1>
        <p>
          Completed runs grouped by skill, task set, and model. Compare within a
          group — cross-model bake-off is out of scope for this MVP.
        </p>
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
            <span className="stat-label">Groups</span>
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
            const groupScored = groupRows.filter((r) => r.score !== null);
            const groupAvg =
              groupScored.length > 0
                ? groupScored.reduce((a, r) => a + (r.score as number), 0) /
                  groupScored.length
                : null;
            const perfect = groupRows.filter((r) => r.score === 1).length;

            return (
              <section key={key} className="panel report-section">
                <header className="group-header">
                  <div>
                    <p className="eyebrow">
                      {head.taskSetId} · {head.modelId}
                    </p>
                    <h2>
                      {head.githubUrl ? (
                        <a
                          href={head.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {head.skillId}
                        </a>
                      ) : (
                        head.skillId
                      )}
                    </h2>
                  </div>
                  <div className="group-stats">
                    <span>
                      {groupRows.length} run{groupRows.length === 1 ? "" : "s"}
                    </span>
                    <span>avg {groupAvg !== null ? groupAvg.toFixed(2) : "—"}</span>
                    <span>
                      {perfect} perfect
                    </span>
                  </div>
                </header>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Run</th>
                        <th>Mode</th>
                        <th>Score</th>
                        <th>Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((r) => (
                        <tr key={r.runId}>
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
