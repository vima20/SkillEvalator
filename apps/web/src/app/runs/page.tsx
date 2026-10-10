import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "@/lib/json";
import { resultsDir } from "@/lib/paths";

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
      <h1 style={{ marginTop: 0 }}>Runs</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Run</th>
            <th align="left">Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.runId}>
              <td style={{ padding: "8px 0" }}>
                <a href={`/runs/${r.runId}`}>{r.runId}</a>
              </td>
              <td>{r.status ?? "?"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 ? <p>No runs yet.</p> : null}
    </div>
  );
}
