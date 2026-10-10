import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "@/lib/json";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const root = resultsDir();
  const rows: Array<{
    runId: string;
    score: number | null;
    modelId: string;
    taskSetId: string;
    mode: string;
  }> = [];

  if (fs.existsSync(root)) {
    for (const id of fs.readdirSync(root)) {
      const rp = path.join(root, id, "result.json");
      if (!fs.existsSync(rp)) continue;
      try {
        const r = readJsonFile<{
          score: number | null;
          modelId: string;
          taskSetId: string;
          mode: string;
        }>(rp);
        rows.push({
          runId: id,
          score: r.score,
          modelId: r.modelId,
          taskSetId: r.taskSetId,
          mode: r.mode,
        });
      } catch {
        /* skip */
      }
    }
  }

  rows.sort((a, b) => b.runId.localeCompare(a.runId));

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
