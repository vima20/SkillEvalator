import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { RunsAutoRefresh } from "@/components/RunsAutoRefresh";
import {
  benefitListPairLockedLabel,
  benefitPairCtaLabel,
  benefitPairEvidenceFromPacked,
} from "@/lib/benefitListHints";
import { buildBenefitReportBundle } from "@/lib/benefitWithComparison";
import { benefitListVerdictChipLabel } from "@/lib/comparisonVerdictDisplay";
import { comparisonCellMetaFromPacked } from "@/lib/dashboardComparisonMeta";
import {
  candidateLegKind,
  candidateLegLabel,
  candidateLegSortRank,
  includeInPilotFocusRun,
  type CandidateLegKind,
} from "@/lib/candidateLeg";
import { healOrphansForBrowse } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import { hasPendingEvaluations } from "@/lib/pendingEvaluations";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import { resolveListRunEvaluationId } from "@/lib/runDetailEvaluationPack";
import { listWindDownRunIds, runIsActive } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function BenefitIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const sp = await searchParams;
  const pilotFocus = isPilotFocusParam(sp.focus);

  healOrphansForBrowse();
  const listed = listRuns(resultsDir());
  const hasActive =
    listed.some((r) => runIsActive(r.status, !!r.result)) ||
    hasPendingEvaluations();
  const windDownRunIds = listWindDownRunIds(listed);
  const allRuns = listed
    .filter((r) => r.result)
    // Recommend surface: candidate skill only (baseline is Comparison input).
    .filter((r) => r.result!.role === "candidate")
    .map((r) => {
      const evaluationId = resolveListRunEvaluationId({
        runId: r.runId,
        result: r.result,
      });
      const {
        report,
        comparison,
        tipCandidateRunId,
        tipBaselineRunId,
        meta,
        baseline,
        candidate,
        evaluationId: bundleEvalId,
        pairPending,
      } = buildBenefitReportBundle(r.result!, {
        runId: r.runId,
        evaluationId,
      });
      const resolvedId = bundleEvalId ?? evaluationId;
      const fakeProduce = r.result!.capture?.env?.fakeProduce === true;
      const produceAttested =
        r.result!.capture?.env?.produceAttested === true;
      const kind = candidateLegKind({
        runId: r.runId,
        role: "candidate",
        fakeProduce,
        produceAttested,
        evaluationId: resolvedId ?? undefined,
        tipCandidateRunId,
      }) as CandidateLegKind;
      const { pairChip, pairBlocked } = benefitPairEvidenceFromPacked({
        tipBaselineRunId,
        tipCandidateRunId,
        metaSmoke: meta?.smoke === true,
        baseline,
        candidate,
      });
      return {
        runId: r.runId,
        score: r.result!.score,
        mode: r.result!.mode,
        evaluationId: resolvedId ?? undefined,
        verdict: report.verdict,
        rating: report.rating,
        kind,
        fakeProduce,
        produceAttested,
        pairChip,
        pairBlocked,
        pairPending,
        comparisonMeta: comparisonCellMetaFromPacked({
          meta,
          baseline,
          candidate,
          comparison,
        }),
      };
    })
    // Tip / unpaired first; waiting / superseded / smoke last.
    .sort((a, b) => {
      const d = candidateLegSortRank(a.kind) - candidateLegSortRank(b.kind);
      if (d !== 0) return d;
      // Pair-blocked tips after clean tips within the same leg kind.
      if (a.pairBlocked !== b.pairBlocked) return a.pairBlocked ? 1 : -1;
      return b.runId.localeCompare(a.runId);
    });

  const runs = pilotFocus
    ? allRuns.filter(
        (r) =>
          !r.pairBlocked &&
          includeInPilotFocusRun({
            kind: r.kind,
            mode: r.mode,
            fakeProduce: r.fakeProduce,
            produceAttested: r.produceAttested,
            hasResult: true,
          }),
      )
    : allRuns;
  const hidden = allRuns.length - runs.length;

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · Recommend</p>
          <h1>Benefit Report</h1>
          <p>
            Candidate-skill decision artifact (USE / DO NOT USE). Official{" "}
            <strong>USE</strong> requires Comparison <strong>PASS</strong> lift.
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
          <PilotFocusToggle pathname="/benefit" pilotFocus={pilotFocus} />
          <RunsAutoRefresh
            hasActive={hasActive}
            windDownRunIds={windDownRunIds}
          />
          <Link
            className="btn btn-primary"
            href={withPilotFocus("/", pilotFocus)}
          >
            New run
          </Link>
        </div>
      </header>

      <div className="panel callout-info">
        <strong>Comparison vs Benefit</strong>
        <p>
          <Link href={withPilotFocus("/comparison", pilotFocus)}>
            Comparison
          </Link>{" "}
          = baseline↔candidate lift
          (PASS/FAIL). Official PASS needs two independent tip pairs when the
          first is provisional (1/2). Benefit USE / 5★ unlocks only on
          confirmed official PASS; DO NOT USE follows official FAIL.
          Baseline legs are omitted from this list. Tip candidates sort first;
          superseded retries and smoke harness rows stay visible but demoted
          (or hidden in Pilot focus).
        </p>
      </div>

      <div className="panel callout-warn">
        <strong>Forbidden inference</strong>
        <p>
          A Benefit Report result is not proof of Cursor/KH skill adoption. It
          only measures the produce→grade pipeline on a locked task set.
        </p>
      </div>

      <div className="panel">
        {runs.length === 0 ? (
          <EmptyState
            title={
              allRuns.length === 0
                ? "No candidate reports yet"
                : "No reports in pilot focus"
            }
            body={
              allRuns.length === 0
                ? "Finish a candidate run (paired evaluation or single-leg) before opening a Benefit Report."
                : "All candidate rows are smoke, not_attested, superseded, dry-run, FAKE_PRODUCE, or pair-blocked. Show all rows to inspect them."
            }
            actionHref={
              allRuns.length === 0
                ? withPilotFocus("/", pilotFocus)
                : "/benefit"
            }
            actionLabel={
              allRuns.length === 0 ? "Start a run" : "Show all rows"
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Verdict</th>
                  <th>Score</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.runId}>
                    <td>
                      <Link
                        href={withPilotFocus(`/runs/${r.runId}`, pilotFocus)}
                      >
                        {r.runId}
                      </Link>
                      <div className="cell-meta">
                        {r.mode} · {candidateLegLabel(r.kind)} ·{" "}
                        {r.rating.starsDisplay} {r.rating.grade}
                        {r.evaluationId ? (
                          <>
                            {" · "}
                            <Link
                              href={withPilotFocus(
                                `/comparison/${r.evaluationId}`,
                                pilotFocus,
                              )}
                              title={r.comparisonMeta?.title}
                            >
                              Comparison
                            </Link>
                            {r.comparisonMeta
                              ? ` · ${r.comparisonMeta.label}`
                              : null}
                          </>
                        ) : null}
                      </div>
                      {r.pairChip ? (
                        <div className="cell-meta">{r.pairChip}</div>
                      ) : null}
                      {r.verdict.recommendation === "inconclusive" ? (
                        <div className="cell-meta">{r.verdict.headline}</div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`verdict-chip verdict-${r.verdict.recommendation}`}
                        title={r.verdict.headline}
                      >
                        {benefitListVerdictChipLabel({
                          recommendation: r.verdict.recommendation,
                          comparisonListLabel: r.comparisonMeta?.label,
                        })}
                      </span>
                    </td>
                    <td>
                      <strong>{r.score ?? "—"}</strong>
                    </td>
                    <td>
                      {r.kind === "smoke" ? (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={withPilotFocus(
                            `/benefit/${r.runId}`,
                            pilotFocus,
                          )}
                          title="Smoke harness (FAKE_PRODUCE) — not adoption evidence"
                        >
                          Open smoke report
                        </Link>
                      ) : r.kind === "not_attested" ? (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={withPilotFocus(
                            `/benefit/${r.runId}`,
                            pilotFocus,
                          )}
                          title="Missing produceAttested — not live worker evidence"
                        >
                          Open unattested
                        </Link>
                      ) : r.kind === "superseded" ? (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={withPilotFocus(
                            `/benefit/${r.runId}`,
                            pilotFocus,
                          )}
                          title="Superseded candidate — tip leg owns USE / DO NOT USE"
                        >
                          Open superseded
                        </Link>
                      ) : r.pairBlocked ? (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={withPilotFocus(
                            `/benefit/${r.runId}`,
                            pilotFocus,
                          )}
                          title="Pair evidence blocked (sibling smoke / unattested) — not adoption"
                        >
                          {benefitListPairLockedLabel(r.pairChip)}
                        </Link>
                      ) : (
                        (() => {
                          const cta = benefitPairCtaLabel(r.pairPending, {
                            readyLabel: "Open report",
                            comparisonMetaTitle: r.comparisonMeta?.title,
                          });
                          return (
                            <Link
                              className="btn btn-ghost btn-compact"
                              href={withPilotFocus(
                                `/benefit/${r.runId}`,
                                pilotFocus,
                              )}
                              title={cta.title}
                            >
                              {cta.label}
                            </Link>
                          );
                        })()
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
