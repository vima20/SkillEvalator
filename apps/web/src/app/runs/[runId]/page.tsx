import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "@/lib/json";
import { resultsDir } from "@/lib/paths";
import { statusBadgeClass } from "@/lib/status";

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
      <header className="page-header">
        <h1>{runId}</h1>
        <p>Run status, aggregate score, and per-task grades.</p>
      </header>

      <div className="meta-row">
        <span className={statusBadgeClass(status?.status)}>
          {status?.status ?? "unknown"}
        </span>
        {result ? (
          <>
            <span className="score">{result.score ?? "—"}</span>
            <span>
              Model <code>{result.modelId}</code>
            </span>
            <span>
              Skill <code>{result.evalSkillVersion}</code>
            </span>
            <span>
              Task set <code>{result.taskSetId}</code>
            </span>
          </>
        ) : null}
      </div>

      {result ? (
        <>
          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(result.perTask ?? []).map((t) => (
                  <tr key={t.taskId}>
                    <td>{t.taskId}</td>
                    <td>{t.score}</td>
                    <td>
                      <span className={statusBadgeClass(t.status)}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(result.perTask ?? []).length === 0 ? (
              <p className="empty">No per-task results.</p>
            ) : null}
          </div>
          <pre className="json-block">{JSON.stringify(result, null, 2)}</pre>
        </>
      ) : (
        <div className="panel">
          <p className="empty">Waiting for worker… Refresh shortly.</p>
        </div>
      )}
    </div>
  );
}
