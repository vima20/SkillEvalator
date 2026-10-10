import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "@/lib/json";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const dir = path.join(resultsDir(), runId);
  const statusPath = path.join(dir, "status.json");
  const resultPath = path.join(dir, "result.json");
  const status = fs.existsSync(statusPath)
    ? readJsonFile<{ status?: string }>(statusPath)
    : null;
  type Result = {
    score: number | null;
    modelId: string;
    evalSkillVersion: string;
    taskSetId: string;
    perTask?: Array<{ taskId: string; score: number; status: string }>;
  };
  const result = fs.existsSync(resultPath) ? readJsonFile<Result>(resultPath) : null;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{runId}</h1>
      <p>
        Status: <strong>{status?.status ?? "unknown"}</strong>
      </p>
      {result ? (
        <>
          <p>
            Score: <strong>{result.score ?? "—"}</strong> · model{" "}
            <code>{result.modelId}</code> · skill SHA{" "}
            <code>{result.evalSkillVersion}</code> · taskSet{" "}
            <code>{result.taskSetId}</code>
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Task</th>
                <th align="left">Score</th>
                <th align="left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(result.perTask ?? []).map((t) => (
                <tr key={t.taskId}>
                  <td>{t.taskId}</td>
                  <td>{t.score}</td>
                  <td>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <pre
            style={{
              background: "#1e1e1e",
              color: "#eee",
              padding: 12,
              overflow: "auto",
              fontSize: 12,
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </>
      ) : (
        <p>Waiting for worker… Refresh shortly.</p>
      )}
    </div>
  );
}
