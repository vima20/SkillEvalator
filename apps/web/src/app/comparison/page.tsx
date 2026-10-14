import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import {
  listEvaluations,
  loadEvaluationComparison,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

function formatCreated(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(t));
  } catch {
    return iso;
  }
}

export default function ComparisonListPage() {
  const evaluations = listEvaluations().map((e) => {
    const packed = loadEvaluationComparison(e.evaluationId);
    const c = packed.comparison;
    const pending = !c;
    // Prefer Comparison tip legs (then healed meta) so Benefit CTA matches PASS/FAIL.
    const tipCandidateRunId =
      resolveTipCandidateRunId(packed) ?? e.candidateRunId;
    // Chip/label mode from Comparison object (same source as detail), not stale meta.
    const displayMode = c?.mode ?? e.mode;
    return {
      ...e,
      pending,
      verdict: c?.verdict ?? null,
      lift: c?.lift ?? null,
      displayMode,
      baselineStatus: packed.baseline?.status,
      candidateStatus: packed.candidate?.status,
      candidateRunId: tipCandidateRunId,
    };
  });

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · Test (paired)</p>
          <h1>Comparison</h1>
          <p>
            Baseline↔candidate lift on the same task set. Official{" "}
            <strong>PASS</strong> requires candidate ≥0.99 + lift and unlocks
            Benefit <strong>USE</strong>. Dry-run stays{" "}
            <strong>INCONCLUSIVE</strong> (no adoption PASS/FAIL).
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-primary" href="/">
            New evaluation
          </Link>
        </div>
      </header>

      <div className="panel callout-info">
        <strong>How to read this</strong>
        <p>
          Comparison answers: does the skill beat a neutral baseline by ≥5 pp?
          Benefit answers: should Unikie adopt this candidate skill/model
          pairing? Single-leg runs (baseline unchecked) do not appear here.
        </p>
      </div>

      <div className="panel">
        {evaluations.length === 0 ? (
          <EmptyState
            title="No paired evaluations yet"
            body="Start a run with baseline↔candidate enabled to queue both legs and open Comparison."
            actionHref="/"
            actionLabel="New evaluation"
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Evaluation</th>
                  <th>Skill</th>
                  <th>Status</th>
                  <th>Verdict</th>
                  <th>Lift</th>
                  <th>Created</th>
                  <th>Benefit</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((e) => (
                  <tr key={e.evaluationId}>
                    <td>
                      <Link href={`/comparison/${e.evaluationId}`}>
                        {e.evaluationId}
                      </Link>
                    </td>
                    <td>
                      <code>{e.evalSkillId}</code>
                      <div className="cell-meta">{e.displayMode}</div>
                    </td>
                    <td>
                      {e.pending ? (
                        <span className={statusBadgeClass("running")}>
                          waiting
                        </span>
                      ) : (
                        <span className="cell-meta">
                          <span className={statusBadgeClass(e.baselineStatus)}>
                            {e.baselineStatus ?? "—"}
                          </span>
                          {" / "}
                          <span className={statusBadgeClass(e.candidateStatus)}>
                            {e.candidateStatus ?? "—"}
                          </span>
                        </span>
                      )}
                    </td>
                    <td>
                      {e.verdict ? (
                        <span
                          className={`verdict-chip verdict-${
                            e.displayMode === "official" && e.verdict === "PASS"
                              ? "use"
                              : e.displayMode === "official" &&
                                  e.verdict === "FAIL"
                                ? "do_not_use"
                                : "inconclusive"
                          }`}
                          title={
                            e.displayMode === "dry-run"
                              ? "Dry-run — not adoption evidence"
                              : undefined
                          }
                        >
                          {e.verdict}
                          {e.displayMode === "dry-run" ? " · dry-run" : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {e.lift !== null
                        ? `${e.lift >= 0 ? "+" : ""}${(e.lift * 100).toFixed(1)} pp`
                        : "—"}
                    </td>
                    <td>{formatCreated(e.createdAt)}</td>
                    <td>
                      {e.pending ? (
                        "—"
                      ) : (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={`/benefit/${e.candidateRunId}`}
                        >
                          Candidate
                        </Link>
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
