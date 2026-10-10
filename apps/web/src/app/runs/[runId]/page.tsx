import { loadRunResult, loadRunStatus } from "@skillevalator/core";
import { resultsDir } from "@/lib/paths";
import { statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  let status: ReturnType<typeof loadRunStatus> = null;
  let result: ReturnType<typeof loadRunResult> = null;
  let invalid = false;

  try {
    const root = resultsDir();
    status = loadRunStatus(root, runId);
    result = loadRunResult(root, runId);
  } catch {
    invalid = true;
  }

  if (invalid) {
    return (
      <div>
        <header className="page-header">
          <h1>Invalid run</h1>
          <p>The run id is not allowed.</p>
        </header>
      </div>
    );
  }

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
              Skill <code>{result.evalSkillId}</code>{" "}
              <code>{result.evalSkillVersion}</code>
            </span>
            <span>
              Task set <code>{result.taskSetId}</code>
            </span>
            {result.evalSkillGithubUrl ? (
              <span>
                GitHub{" "}
                <a
                  href={result.evalSkillGithubUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {result.evalSkillGithubUrl}
                </a>
              </span>
            ) : null}
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
                {result.perTask.map((t) => (
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
            {result.perTask.length === 0 ? (
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
