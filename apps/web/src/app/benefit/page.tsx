import Link from "next/link";
import { listRuns } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { buildBenefitReportBundle } from "@/lib/benefitWithComparison";
import { healOrphanStatuses } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

type LegKind = "tip" | "superseded" | "smoke" | "single" | "waiting";

function legKindFor(opts: {
  runId: string;
  fakeProduce: boolean;
  evaluationId?: string;
  tipCandidateRunId?: string | null;
}): LegKind {
  if (opts.fakeProduce) return "smoke";
  if (!opts.evaluationId) return "single";
  if (!opts.tipCandidateRunId) return "waiting";
  if (opts.tipCandidateRunId !== opts.runId) return "superseded";
  return "tip";
}

function legKindLabel(kind: LegKind): string {
  switch (kind) {
    case "tip":
      return "tip candidate";
    case "superseded":
      return "superseded";
    case "smoke":
      return "smoke (FAKE_PRODUCE)";
    case "single":
      return "unpaired";
    case "waiting":
      return "waiting for tip";
  }
}

export default function BenefitIndexPage() {
  healOrphanStatuses();
  const runs = listRuns(resultsDir())
    .filter((r) => r.result)
    // Recommend surface: candidate skill only (baseline is Comparison input).
    .filter((r) => r.result!.role === "candidate")
    .map((r) => {
      const { report, tipCandidateRunId } = buildBenefitReportBundle(
        r.result!,
      );
      const fakeProduce = r.result!.capture?.env?.fakeProduce === true;
      const kind = legKindFor({
        runId: r.runId,
        fakeProduce,
        evaluationId: r.result!.evaluationId,
        tipCandidateRunId,
      });
      return {
        runId: r.runId,
        score: r.result!.score,
        mode: r.result!.mode,
        evaluationId: r.result!.evaluationId,
        verdict: report.verdict,
        rating: report.rating,
        kind,
      };
    })
    // Tip / unpaired first; waiting / superseded / smoke last.
    .sort((a, b) => {
      const rank = (k: LegKind) =>
        k === "tip"
          ? 0
          : k === "single"
            ? 1
            : k === "waiting"
              ? 2
              : k === "superseded"
                ? 3
                : 4;
      const d = rank(a.kind) - rank(b.kind);
      if (d !== 0) return d;
      return b.runId.localeCompare(a.runId);
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
          (PASS/FAIL). Benefit USE / 5★ unlocks only on official PASS; DO NOT
          USE follows official FAIL.
          Baseline legs are omitted from this list. Tip candidates sort first;
          superseded retries and smoke harness rows stay visible but demoted.
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
                        {r.mode} · {legKindLabel(r.kind)} ·{" "}
                        {r.rating.starsDisplay} {r.rating.grade}
                        {r.evaluationId ? (
                          <>
                            {" · "}
                            <Link href={`/comparison/${r.evaluationId}`}>
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
