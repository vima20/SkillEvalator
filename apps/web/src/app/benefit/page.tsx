import Link from "next/link";
import { buildBenefitReport, listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { resultsDir } from "@/lib/paths";
import { statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function BenefitIndexPage() {
  const runs = listRuns(resultsDir())
    .filter((r) => r.result)
    .map((r) => ({
      ...r,
      verdict: buildBenefitReport(r.result!).verdict,
    }));

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Decision artifact</p>
        <h1>Benefit Report</h1>
        <p>
          Scorecard, config, cost, and constraints for a completed run. Not
          KH-adoption proof — pick a run to open its report.
        </p>
      </header>

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
            title="No completed runs"
            body="Finish a dry-run or official evaluation before generating a Benefit Report."
            actionHref="/"
            actionLabel="Start a run"
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Verdict</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Score</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const rating = buildBenefitReport(r.result!).rating;
                return (
                <tr key={r.runId}>
                  <td>
                    <Link href={`/runs/${r.runId}`}>{r.runId}</Link>
                  </td>
                  <td>
                    <span className={`verdict-chip verdict-${r.verdict.recommendation}`}>
                      {r.verdict.recommendation === "use"
                        ? "USE"
                        : r.verdict.recommendation === "do_not_use"
                          ? "DO NOT USE"
                          : "INCONCLUSIVE"}
                    </span>
                  </td>
                  <td>
                    <span className="stars-inline" title={`${rating.grade}`}>
                      {rating.starsDisplay}{" "}
                      <span className="stars-inline-grade">{rating.grade}</span>
                    </span>
                  </td>
                  <td>
                    <span className={statusBadgeClass(r.status)}>
                      {r.status ?? "unknown"}
                    </span>
                  </td>
                  <td>{r.result?.mode ?? "—"}</td>
                  <td>
                    <strong>{r.result?.score ?? "—"}</strong>
                  </td>
                  <td>
                    <Link className="btn btn-ghost btn-compact" href={`/benefit/${r.runId}`}>
                      Open report
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
