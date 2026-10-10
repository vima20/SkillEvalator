import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "@/lib/json";
import { resultsDir } from "@/lib/paths";
import { statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function RunsPage() {
  const root = resultsDir();
  const runs: Array<{ runId: string; status?: string }> = [];
  if (fs.existsSync(root)) {
    for (const id of fs.readdirSync(root)) {
      const sp = path.join(root, id, "status.json");
      if (!fs.existsSync(sp)) continue;
      try {
        const status = readJsonFile<{ status?: string }>(sp);
        runs.push({ runId: id, status: status.status });
      } catch {
        /* skip corrupt */
      }
    }
  }
  runs.sort((a, b) => b.runId.localeCompare(a.runId));

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
