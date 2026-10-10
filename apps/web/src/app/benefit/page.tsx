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
        <strong>Kielletty inferenssi</strong>
        <p>
          Benefit Report -tulos ≠ Cursor/KH skill adoption -todiste. Se mittaa
          vain produce→grade -putkea lukitulla task setillä.
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
                <th>Tuomio</th>
                <th>Arvosana</th>
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
                        ? "KÄYTÄ"
                        : r.verdict.recommendation === "do_not_use"
                          ? "ÄLÄ KÄYTÄ"
                          : "EI VOIDA TUOMITA"}
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
