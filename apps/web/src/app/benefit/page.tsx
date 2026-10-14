import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { buildBenefitReportForRun } from "@/lib/benefitWithComparison";
import { healOrphanStatuses } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default function BenefitIndexPage() {
  healOrphanStatuses();
  const runs = listRuns(resultsDir())
    .filter((r) => r.result)
    // Recommend surface: candidate skill only (baseline is Comparison input).
    .filter((r) => (r.result!.role ?? "candidate") === "candidate")
    .map((r) => {
      const report = buildBenefitReportForRun(r.result!);
      return {
        runId: r.runId,
        score: r.result!.score,
        mode: r.result!.mode,
        evaluationId: r.result!.evaluationId,
        verdict: report.verdict,
        rating: report.rating,
      };
    });

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Unikie · Recommend</p>
        <h1>Benefit Report</h1>
        <p>
          Candidate-skill decision artifact (USE / DO NOT USE). Official{" "}
          <strong>USE</strong> requires Comparison <strong>PASS</strong> lift.
        </p>
      </header>

      <div className="panel callout-info">
        <strong>Comparison vs Benefit</strong>
        <p>
          <Link href="/comparison">Comparison</Link> = baseline↔candidate lift
          (PASS/FAIL). Benefit USE / 5★ unlocks only when that lift is PASS.
          Baseline legs are omitted from this list.
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
            title="No candidate reports yet"
            body="Finish a candidate run (paired evaluation or single-leg) before opening a Benefit Report."
            actionHref="/"
            actionLabel="Start a run"
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
                      <Link href={`/runs/${r.runId}`}>{r.runId}</Link>
                      <div className="cell-meta">
                        {r.mode} · {r.rating.starsDisplay} {r.rating.grade}
                        {r.evaluationId ? (
                          <>
                            {" · "}
                            <Link href={`/comparison/${r.evaluationId}`}>
                              Comparison
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`verdict-chip verdict-${r.verdict.recommendation}`}
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
                        href={`/benefit/${r.runId}`}
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
