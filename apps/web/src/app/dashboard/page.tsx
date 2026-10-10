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

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <p style={{ color: "#444" }}>
        Compare runs with the same skill + taskSet + model (no multi-model
        comparison in MVP).
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Run</th>
            <th align="left">Mode</th>
            <th align="left">Model</th>
            <th align="left">Task set</th>
            <th align="left">Score</th>
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
              <td>{r.score ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p>No completed runs.</p> : null}
    </div>
  );
}
