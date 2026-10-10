import { listRuns } from "@skillevalator/core";
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
      },
    ];
  });

  return (
    <div>
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>
          Compare completed runs with the same skill, task set, and model. Multi-model
          comparison is out of scope for this MVP.
        </p>
      </header>

      <div className="panel">
        {rows.length === 0 ? (
          <p className="empty">No completed runs yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Mode</th>
                <th>Model</th>
                <th>Task set</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.runId}>
                  <td>
                    <a href={`/runs/${r.runId}`}>{r.runId}</a>
                  </td>
                  <td>{r.mode}</td>
                  <td>
                    <code>{r.modelId}</code>
                  </td>
                  <td>
                    <code>{r.taskSetId}</code>
                  </td>
                  <td>
                    <strong>{r.score ?? "—"}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
