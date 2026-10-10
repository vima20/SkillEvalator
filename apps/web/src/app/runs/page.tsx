import { listRuns } from "@skillevalator/core";
import { resultsDir } from "@/lib/paths";
import { statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function RunsPage() {
  const runs = listRuns(resultsDir());

  return (
    <div>
      <header className="page-header">
        <h1>Runs</h1>
        <p>Queued and completed evaluation jobs from the local worker.</p>
      </header>

      <div className="panel">
        {runs.length === 0 ? (
          <p className="empty">No runs yet. Start one from New run.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId}>
                  <td>
                    <a href={`/runs/${r.runId}`}>{r.runId}</a>
                  </td>
                  <td>
                    <span className={statusBadgeClass(r.status)}>
                      {r.status ?? "unknown"}
                    </span>
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
