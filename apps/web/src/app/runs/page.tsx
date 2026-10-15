import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { ClearOldRuns } from "@/components/ClearOldRuns";
import { ClearSmokeNoise } from "@/components/ClearSmokeNoise";
import { EmptyState } from "@/components/EmptyState";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { RunsAutoRefresh } from "@/components/RunsAutoRefresh";
import {
  candidateLegKind,
  includeInPilotFocusRun,
} from "@/lib/candidateLeg";
import { withPilotFocus } from "@/lib/pilotFocusHref";
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

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const sp = await searchParams;
  const pilotFocus = sp.focus === "pilot";

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

  const allRuns = listRuns(resultsDir());
  const hasActive = allRuns.some((r) => runIsActive(r.status, !!r.result));

  const runs = pilotFocus
    ? allRuns.filter((r) => {
        const fakeProduce = r.result?.capture?.env?.fakeProduce === true;
        const role = r.result?.role ?? r.role;
        const evaluationId = r.result?.evaluationId ?? r.evaluationId;
        const tip = evaluationId ? tipFor(evaluationId) : null;
        const kind = candidateLegKind({
          runId: r.runId,
          role: typeof role === "string" ? role : undefined,
          fakeProduce,
          evaluationId,
          tipCandidateRunId: tip,
        });
        return includeInPilotFocusRun({
          kind,
          mode: r.result?.mode,
          fakeProduce,
          hasResult: !!r.result,
        });
      })
    : allRuns;

  const hidden = allRuns.length - runs.length;

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · History</p>
          <h1>Runs</h1>
          <p>
            Queued and completed evaluation jobs. Candidate tip / smoke /
            superseded hints match Benefit demotion.
            {pilotFocus ? (
              <>
                {" "}
                <strong>Pilot focus</strong> hides smoke, superseded, and
                dry-run
                {hidden > 0 ? ` (${hidden} hidden)` : ""}.
              </>
            ) : null}
          </p>
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle pathname="/runs" pilotFocus={pilotFocus} />
          <RunsAutoRefresh hasActive={hasActive} />
          {pilotFocus ? null : <ClearSmokeNoise />}
          <ClearOldRuns />
          <Link
            className="btn btn-primary"
            href={withPilotFocus("/", pilotFocus)}
          >
            New run
          </Link>
        </div>
      </header>

      <div className="panel">
        {runs.length === 0 ? (
          <EmptyState
            title={
              allRuns.length === 0
                ? "No runs yet"
                : "No runs in pilot focus"
            }
            body={
              allRuns.length === 0
                ? "Start a dry-run to queue the first evaluation job."
                : "All visible rows are smoke or superseded. Show all rows to inspect them."
            }
            actionHref={allRuns.length === 0 ? "/" : "/runs"}
            actionLabel={allRuns.length === 0 ? "Start a run" : "Show all rows"}
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
                        <Link
                          href={withPilotFocus(`/runs/${r.runId}`, pilotFocus)}
                        >
                          {r.runId}
                        </Link>
                        {evaluationId ? (
                          <div className="cell-meta">
                            <Link
                              href={withPilotFocus(
                                `/comparison/${evaluationId}`,
                                pilotFocus,
                              )}
                            >
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
