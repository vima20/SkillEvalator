import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { ClearOldRuns } from "@/components/ClearOldRuns";
import { ClearSmokeNoise } from "@/components/ClearSmokeNoise";
import { EmptyState } from "@/components/EmptyState";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { RunsAutoRefresh } from "@/components/RunsAutoRefresh";
import {
  benefitPairEvidenceFromPacked,
  type BenefitListPairChip,
} from "@/lib/benefitListHints";
import {
  candidateLegKind,
  includeInPilotFocusRun,
} from "@/lib/candidateLeg";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { comparisonCellMetaFromPacked } from "@/lib/dashboardComparisonMeta";
import { healOrphansForBrowse } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import { hasPendingEvaluations } from "@/lib/pendingEvaluations";
import { resolveListRunEvaluationId } from "@/lib/runDetailEvaluationPack";
import {
  candidateRunsListHint,
  runsListHintLabel,
} from "@/lib/runsListHints";
import {
  listWindDownRunIds,
  runIsActive,
  statusBadgeClass,
} from "@/lib/status";

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
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const sp = await searchParams;
  const pilotFocus = isPilotFocusParam(sp.focus);

  healOrphansForBrowse();
  const pairByEval = new Map<
    string,
    {
      tipCandidateRunId: string | null;
      pairChip: BenefitListPairChip | null;
      pairBlocked: boolean;
      comparisonMeta: ReturnType<typeof comparisonCellMetaFromPacked>;
    }
  >();
  const pairFor = (evaluationId: string) => {
    if (!pairByEval.has(evaluationId)) {
      const packed = loadEvaluationComparison(evaluationId);
      const tipCandidateRunId = resolveTipCandidateRunId(packed);
      const tipBaselineRunId = resolveTipBaselineRunId(packed);
      const { pairChip, pairBlocked } = benefitPairEvidenceFromPacked({
        tipBaselineRunId,
        tipCandidateRunId,
        metaSmoke: packed.meta?.smoke === true,
        baseline: packed.baseline,
        candidate: packed.candidate,
      });
      pairByEval.set(evaluationId, {
        tipCandidateRunId,
        pairChip,
        pairBlocked,
        comparisonMeta: comparisonCellMetaFromPacked(packed),
      });
    }
    return pairByEval.get(evaluationId)!;
  };

  const allRuns = listRuns(resultsDir());
  const hasActive =
    allRuns.some((r) => runIsActive(r.status, !!r.result)) ||
    hasPendingEvaluations();
  const windDownRunIds = listWindDownRunIds(allRuns);

  const runs = pilotFocus
    ? allRuns.filter((r) => {
        const fakeProduce = r.result?.capture?.env?.fakeProduce === true;
        const produceAttested =
          r.result?.capture?.env?.produceAttested === true;
        const role = r.result?.role ?? r.role;
        const evaluationId =
          resolveListRunEvaluationId({
            runId: r.runId,
            result: r.result,
          }) ?? undefined;
        const pair = evaluationId ? pairFor(evaluationId) : null;
        if (pair?.pairBlocked) return false;
        const kind = candidateLegKind({
          runId: r.runId,
          role: typeof role === "string" ? role : undefined,
          fakeProduce,
          produceAttested,
          evaluationId,
          tipCandidateRunId: pair?.tipCandidateRunId ?? null,
        });
        return includeInPilotFocusRun({
          kind,
          mode: r.result?.mode,
          fakeProduce,
          produceAttested,
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
            superseded and pair evidence chips match Benefit demotion.
            Comparison links show paired verdict (including provisional official{" "}
            1/2).
            {pilotFocus ? (
              <>
                {" "}
                <strong>Pilot focus</strong> hides smoke, not_attested,
                superseded, dry-run, and pair-blocked siblings
                {hidden > 0 ? ` (${hidden} hidden)` : ""}.
              </>
            ) : null}
          </p>
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle pathname="/runs" pilotFocus={pilotFocus} />
          <RunsAutoRefresh
            hasActive={hasActive}
            windDownRunIds={windDownRunIds}
          />
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
                : "All visible rows are smoke, not_attested, superseded, dry-run, FAKE_PRODUCE, or pair-blocked. Show all rows to inspect them."
            }
            actionHref={
              allRuns.length === 0
                ? withPilotFocus("/", pilotFocus)
                : "/runs"
            }
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
                    resolveListRunEvaluationId({
                      runId: r.runId,
                      result: r.result,
                    }) ?? undefined;
                  const pair = evaluationId ? pairFor(evaluationId) : null;
                  const tip = pair?.tipCandidateRunId ?? null;
                  const hint = candidateRunsListHint({
                    runId: r.runId,
                    role: typeof role === "string" ? role : undefined,
                    fakeProduce:
                      r.result?.capture?.env?.fakeProduce === true,
                    produceAttested:
                      r.result?.capture?.env?.produceAttested === true,
                    evaluationId,
                    tipCandidateRunId: tip,
                  });
                  const hintLabel = runsListHintLabel(hint);
                  const pairChip = pair?.pairChip ?? null;
                  const comparisonMeta = pair?.comparisonMeta ?? null;
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
                              title={comparisonMeta?.title}
                            >
                              Comparison
                            </Link>
                            {comparisonMeta ? ` · ${comparisonMeta.label}` : null}
                            {hintLabel ? ` · ${hintLabel}` : null}
                            {pairChip ? ` · ${pairChip}` : null}
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
                          className={`${statusBadgeClass(r.status, Boolean(r.result))}${active ? " badge-live" : ""}`}
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
