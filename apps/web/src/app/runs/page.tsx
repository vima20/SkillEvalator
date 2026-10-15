import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { ClearOldRuns } from "@/components/ClearOldRuns";
import { EmptyState } from "@/components/EmptyState";
import { RunsAutoRefresh } from "@/components/RunsAutoRefresh";
import {
  loadEvaluationComparison,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { healOrphanStatuses } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import {
  candidateRunsListHint,
  runsListHintLabel,
} from "@/lib/runsListHints";
import { runIsActive, statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

function shortError(msg: string | undefined, max = 72): string | null {
  if (!msg) return null;
  const one = msg.replace(/\s+/g, " ").trim();
  if (!one) return null;
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

export default function RunsPage() {
  healOrphanStatuses();
  const tipByEval = new Map<string, string | null>();
  const tipFor = (evaluationId: string): string | null => {
    if (!tipByEval.has(evaluationId)) {
      tipByEval.set(
        evaluationId,
        resolveTipCandidateRunId(loadEvaluationComparison(evaluationId)),
      );
    }
    return tipByEval.get(evaluationId) ?? null;
  };

  const runs = listRuns(resultsDir());
  const hasActive = runs.some((r) => runIsActive(r.status, !!r.result));

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · History</p>
          <h1>Runs</h1>
          <p>
            Queued and completed evaluation jobs. Candidate tip / smoke /
            superseded hints match Benefit demotion.
          </p>
        </div>
        <div className="page-header-actions">
          <RunsAutoRefresh hasActive={hasActive} />
          <ClearOldRuns />
          <Link className="btn btn-primary" href="/">
            New run
          </Link>
        </div>
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
                  <th>Role</th>
                  <th>Status</th>
                  <th className="col-hide-sm">Error</th>
                  <th className="col-hide-sm">Mode</th>
                  <th>Score</th>
                  <th>Skill</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const err = shortError(r.error);
                  const active = runIsActive(r.status, !!r.result);
                  const role = r.result?.role ?? r.role ?? "—";
                  const evaluationId =
                    r.result?.evaluationId ?? r.evaluationId;
                  const tip = evaluationId ? tipFor(evaluationId) : null;
                  const hint = candidateRunsListHint({
                    runId: r.runId,
                    role: typeof role === "string" ? role : undefined,
                    fakeProduce:
                      r.result?.capture?.env?.fakeProduce === true,
                    evaluationId,
                    tipCandidateRunId: tip,
                  });
                  const hintLabel = runsListHintLabel(hint);
                  return (
                    <tr key={r.runId}>
                      <td>
                        <Link href={`/runs/${r.runId}`}>{r.runId}</Link>
                        {evaluationId ? (
                          <div className="cell-meta">
                            <Link href={`/comparison/${evaluationId}`}>
                              Comparison
                            </Link>
                            {hintLabel ? ` · ${hintLabel}` : null}
                          </div>
                        ) : hintLabel ? (
                          <div className="cell-meta">{hintLabel}</div>
                        ) : null}
                      </td>
                      <td>
                        {role === "baseline" || role === "candidate" ? (
                          <span className={`role-chip role-${role}`}>{role}</span>
                        ) : (
                          role
                        )}
                      </td>
                      <td>
                        <span
                          className={`${statusBadgeClass(r.status)}${active ? " badge-live" : ""}`}
                        >
                          {r.status ?? "unknown"}
                        </span>
                      </td>
                      <td className="col-hide-sm">
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
                      <td className="col-hide-sm">{r.result?.mode ?? "—"}</td>
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
                          (r.result?.evalSkillId ?? "—")
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
