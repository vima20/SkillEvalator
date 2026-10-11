import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { resultsDir } from "@/lib/paths";
import { statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

function shortError(msg: string | undefined, max = 72): string | null {
  if (!msg) return null;
  const one = msg.replace(/\s+/g, " ").trim();
  if (!one) return null;
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

export default function RunsPage() {
  const runs = listRuns(resultsDir());

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · History</p>
          <h1>Runs</h1>
          <p>Queued and completed evaluation jobs from the local worker.</p>
        </div>
        <Link className="btn btn-primary" href="/">
          New run
        </Link>
      </header>

      <div className="panel">
        {runs.length === 0 ? (
          <EmptyState
            title="No runs yet"
            body="Start a dry-run to queue the first evaluation job."
            actionHref="/"
            actionLabel="Start a run"
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Error</th>
                  <th>Mode</th>
                  <th>Score</th>
                  <th>Skill</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const err = shortError(r.error);
                  return (
                    <tr key={r.runId}>
                      <td>
                        <Link href={`/runs/${r.runId}`}>{r.runId}</Link>
                      </td>
                      <td>
                        <span className={statusBadgeClass(r.status)}>
                          {r.status ?? "unknown"}
                        </span>
                      </td>
                      <td>
                        {err ? (
                          <span className="run-error-snip" title={r.error}>
                            {r.errorCode ? (
                              <>
                                <code>{r.errorCode}</code>{" "}
                              </>
                            ) : null}
                            {err}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{r.result?.mode ?? "—"}</td>
                      <td>
                        <strong>{r.result?.score ?? "—"}</strong>
                      </td>
                      <td>
                        {r.result?.evalSkillGithubUrl ? (
                          <a
                            href={r.result.evalSkillGithubUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.result.evalSkillId}
                          </a>
                        ) : (
                          <code>{r.result?.evalSkillId ?? "—"}</code>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
