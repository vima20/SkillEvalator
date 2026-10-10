import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const rows = listRuns(resultsDir()).flatMap((r) => {
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
          Completed runs for the same skill, task set, and model. Multi-model
          comparison is out of scope for this MVP.
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
            <span className="stat-label">Perfect runs</span>
            <span className="stat-value">
              {rows.filter((r) => r.score === 1).length}
            </span>
          </div>
        </div>
      ) : null}

      <div className="panel">
        {rows.length === 0 ? (
          <EmptyState
            title="No completed runs"
            body="Finish a dry-run or official evaluation to populate the dashboard."
            actionHref="/"
            actionLabel="Start a run"
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Mode</th>
                  <th>Model</th>
                  <th>Task set</th>
                  <th>GitHub</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.runId}>
                    <td>
                      <Link href={`/runs/${r.runId}`}>{r.runId}</Link>
                    </td>
                    <td>{r.mode}</td>
                    <td>
                      <code>{r.modelId}</code>
                    </td>
                    <td>
                      <code>{r.taskSetId}</code>
                    </td>
                    <td>
                      {r.githubUrl ? (
                        <a href={r.githubUrl} target="_blank" rel="noreferrer">
                          {r.skillId}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <strong>{r.score ?? "—"}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
