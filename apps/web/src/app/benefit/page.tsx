import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { buildBenefitReportBundle } from "@/lib/benefitWithComparison";
import {
  candidateLegKind,
  candidateLegLabel,
  candidateLegSortRank,
  includeInPilotFocusRun,
  type CandidateLegKind,
} from "@/lib/candidateLeg";
import { healOrphanStatuses } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import { withPilotFocus } from "@/lib/pilotFocusHref";

export const dynamic = "force-dynamic";

export default async function BenefitIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const sp = await searchParams;
  const pilotFocus = sp.focus === "pilot";

  healOrphanStatuses();
  const allRuns = listRuns(resultsDir())
    .filter((r) => r.result)
    // Recommend surface: candidate skill only (baseline is Comparison input).
    .filter((r) => r.result!.role === "candidate")
    .map((r) => {
      const { report, tipCandidateRunId } = buildBenefitReportBundle(
        r.result!,
      );
      const fakeProduce = r.result!.capture?.env?.fakeProduce === true;
      const kind = candidateLegKind({
        runId: r.runId,
        role: "candidate",
        fakeProduce,
        evaluationId: r.result!.evaluationId,
        tipCandidateRunId,
      }) as CandidateLegKind;
      return {
        runId: r.runId,
        score: r.result!.score,
        mode: r.result!.mode,
        evaluationId: r.result!.evaluationId,
        verdict: report.verdict,
        rating: report.rating,
        kind,
        fakeProduce,
      };
    })
    // Tip / unpaired first; waiting / superseded / smoke last.
    .sort((a, b) => {
      const d = candidateLegSortRank(a.kind) - candidateLegSortRank(b.kind);
      if (d !== 0) return d;
      return b.runId.localeCompare(a.runId);
    });

  const runs = pilotFocus
    ? allRuns.filter((r) =>
        includeInPilotFocusRun({
          kind: r.kind,
          mode: r.mode,
          fakeProduce: r.fakeProduce,
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
                <strong>Pilot focus</strong> hides smoke, superseded, and
                dry-run
                {hidden > 0 ? ` (${hidden} hidden)` : ""}.
              </>
            ) : null}
          </p>
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle pathname="/benefit" pilotFocus={pilotFocus} />
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
          (PASS/FAIL). Benefit USE / 5★ unlocks only on official PASS; DO NOT
          USE follows official FAIL.
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
                : "All candidate rows are smoke or superseded. Show all rows to inspect them."
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
                            >
                              Comparison
                            </Link>
                          </>
                        ) : null}
                      </div>
                      {r.verdict.recommendation === "inconclusive" ? (
                        <div className="cell-meta">{r.verdict.headline}</div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`verdict-chip verdict-${r.verdict.recommendation}`}
                        title={r.verdict.headline}
                      >
                        {r.verdict.recommendation === "use"
                          ? "USE"
                          : r.verdict.recommendation === "do_not_use"
                            ? "DO NOT USE"
                            : "INCONCLUSIVE"}
                      </span>
                    </td>
                    <td>
                      <strong>{r.score ?? "—"}</strong>
                    </td>
                    <td>
                      <Link
                        className="btn btn-ghost btn-compact"
                        href={withPilotFocus(`/benefit/${r.runId}`, pilotFocus)}
                      >
                        Open report
                      </Link>
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
