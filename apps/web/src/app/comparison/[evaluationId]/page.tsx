import Link from "next/link";
import { healRunOrphansFs, syncStatusFromResult } from "@skillevalator/core";
import { ComparisonPending } from "@/components/ComparisonPending";
import { EmptyState } from "@/components/EmptyState";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

function verdictClass(v: string, mode: string): string {
  // Only official PASS/FAIL get adoption styling (dry-run stays inconclusive).
  if (v === "PASS" && mode === "official") return "verdict-banner verdict-use";
  if (v === "FAIL" && mode === "official")
    return "verdict-banner verdict-do_not_use";
  if (v === "PASS" || v === "FAIL")
    return "verdict-banner verdict-inconclusive";
  return "verdict-banner verdict-inconclusive";
}

function fmtScore(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "—";
}

export default async function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ evaluationId: string }>;
}) {
  const { evaluationId } = await params;
  const root = resultsDir();
  const jobs = jobsDir();

  let invalid = false;
  let packed: ReturnType<typeof loadEvaluationComparison> | null = null;
  try {
    packed = loadEvaluationComparison(evaluationId);
    if (packed.meta?.baselineRunId) {
      healRunOrphansFs(jobs, root, packed.meta.baselineRunId, isPidAlive);
    }
    if (packed.meta?.candidateRunId) {
      healRunOrphansFs(jobs, root, packed.meta.candidateRunId, isPidAlive);
    }
    // Reload after heal
    packed = loadEvaluationComparison(evaluationId);
  } catch {
    invalid = true;
  }

  if (invalid || !packed?.meta) {
    return (
      <div>
        <header className="page-header">
          <p className="eyebrow">Unikie · Comparison</p>
          <h1>Evaluation not found</h1>
        </header>
        <div className="panel">
          <EmptyState
            title="Unknown evaluation"
            body="No paired baseline↔candidate evaluation with this id."
            actionHref="/comparison"
            actionLabel="Back to Comparison"
          />
        </div>
      </div>
    );
  }

  const { meta, baseline, candidate, comparison } = packed;
  // Tip legs: Comparison first, then healed meta (same helpers as CSV / Dashboard).
  const baselineRunId =
    resolveTipBaselineRunId(packed) ?? meta.baselineRunId;
  const candidateRunId =
    resolveTipCandidateRunId(packed) ?? meta.candidateRunId;
  const baselineStatus =
    syncStatusFromResult(root, baselineRunId)?.status ??
    baseline?.status;
  const candidateStatus =
    syncStatusFromResult(root, candidateRunId)?.status ??
    candidate?.status;

  if (!comparison || !baseline || !candidate) {
    return (
      <div>
        <header className="page-header">
          <p className="eyebrow">
            <Link href="/comparison">Comparison</Link>
            <span aria-hidden="true"> / </span>
            {evaluationId}
          </p>
          <h1>Waiting for results</h1>
        </header>
        <ComparisonPending
          evaluationId={evaluationId}
          baselineRunId={baselineRunId}
          candidateRunId={candidateRunId}
          baselineStatus={baselineStatus}
          candidateStatus={candidateStatus}
          baselineHasResult={!!baseline}
          candidateHasResult={!!candidate}
        />
      </div>
    );
  }

  const capture = comparison.capture;

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">
            <Link href="/comparison">Comparison</Link>
            <span aria-hidden="true"> / </span>
            {evaluationId}
          </p>
          <h1>Baseline ↔ candidate</h1>
          <p>
            Skill <code>{comparison.evalSkillId}</code> · task set{" "}
            <code>{comparison.taskSetId}</code> · {comparison.mode} ·{" "}
            <code>{comparison.modelId}</code>
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-ghost" href={`/runs/${baselineRunId}`}>
            Baseline run
          </Link>
          <Link className="btn btn-ghost" href={`/runs/${candidateRunId}`}>
            Candidate run
          </Link>
          <Link
            className="btn btn-primary"
            href={`/benefit/${candidateRunId}`}
          >
            Benefit Report
          </Link>
          {comparison.mode === "official" &&
            (comparison.verdict === "PASS" ||
              comparison.verdict === "FAIL") && (
              <a
                className="btn btn-ghost"
                href={`/api/comparison/${evaluationId}/csv`}
              >
                Download CSV
              </a>
            )}
        </div>
      </header>

      <div className="panel callout-info">
        <strong>Comparison vs Benefit</strong>
        <p>
          <strong>{comparison.verdict}</strong> here is the paired lift gate
          (baseline↔candidate). Official PASS also requires candidate score ≥
          0.99 (Benefit USE floor). Benefit{" "}
          <Link href={`/benefit/${candidateRunId}`}>USE</Link> needs official
          PASS; <Link href={`/benefit/${candidateRunId}`}>DO NOT USE</Link>{" "}
          needs official FAIL.
        </p>
      </div>

      {comparison.mode === "dry-run" ? (
        <div className="panel callout-warn">
          <strong>Dry-run only</strong>
          <p>
            Dry-run paired results stay INCONCLUSIVE for adoption (no PASS/FAIL).
            CSV export is locked until mode=official.
          </p>
        </div>
      ) : null}

      <section className={verdictClass(comparison.verdict, comparison.mode)}>
        <p className="eyebrow">
          Unikie paired verdict
          {comparison.mode === "dry-run" ? " · dry-run" : ""}
        </p>
        <p className="verdict-headline">{comparison.verdict}</p>
        <p className="verdict-decision">
          Lift{" "}
          {comparison.lift !== null
            ? `${(comparison.lift * 100).toFixed(1)} pp`
            : "—"}{" "}
          (candidate {fmtScore(comparison.candidateScore)} − baseline{" "}
          {fmtScore(comparison.baselineScore)})
        </p>
        <p className="verdict-rationale">{comparison.rationale}</p>
      </section>

      {!comparison.parity.ok ? (
        <div className="panel callout-warn" style={{ marginTop: "1rem" }}>
          <strong>Parity check failed</strong>
          <p>
            Baseline and candidate runs do not match on capture fields.
            Comparison PASS/FAIL may be unreliable until these are fixed:
          </p>
          <ul className="bullet-list">
            {comparison.parity.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="split" style={{ marginTop: "1.25rem" }}>
        <div className="panel">
          <h2>Scorecard</h2>
          <dl className="meta-list">
            <div>
              <dt>Baseline score</dt>
              <dd>{fmtScore(comparison.baselineScore)}</dd>
            </div>
            <div>
              <dt>Candidate score</dt>
              <dd>{fmtScore(comparison.candidateScore)}</dd>
            </div>
            <div>
              <dt>Lift</dt>
              <dd>
                {comparison.lift !== null ? comparison.lift.toFixed(3) : "—"}
              </dd>
            </div>
            <div>
              <dt>Combined cost</dt>
              <dd>${comparison.costUsd.toFixed(4)}</dd>
            </div>
            <div>
              <dt>Combined latency</dt>
              <dd>{Math.round(comparison.latencyMs / 1000)}s</dd>
            </div>
            <div>
              <dt>Task deltas</dt>
              <dd>
                {comparison.improvements} improved · {comparison.regressions}{" "}
                regressed · parity{" "}
                {comparison.parity.ok ? "OK" : "FAIL"}
              </dd>
            </div>
            <div>
              <dt>Baseline status</dt>
              <dd>
                <span className={statusBadgeClass(comparison.baselineStatus)}>
                  {comparison.baselineStatus}
                </span>
              </dd>
            </div>
            <div>
              <dt>Candidate status</dt>
              <dd>
                <span className={statusBadgeClass(comparison.candidateStatus)}>
                  {comparison.candidateStatus}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="panel">
          <h2>Capture</h2>
          <dl className="meta-list">
            <div>
              <dt>GitHub</dt>
              <dd>
                {capture?.githubUrl ? (
                  <a href={capture.githubUrl} target="_blank" rel="noreferrer">
                    {capture.githubUrl}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd>
                <code>{capture?.commit ?? "—"}</code>
              </dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{capture?.license ?? "—"}</dd>
            </div>
            <div>
              <dt>Dependencies</dt>
              <dd>
                {capture?.dependencies?.length
                  ? capture.dependencies.join(", ")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Skill version</dt>
              <dd>
                <code>{capture?.skillVersion ?? "—"}</code>
              </dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>
                <code>{capture?.promptKind ?? "—"}</code> · hash{" "}
                <code>{capture?.promptHash ?? "—"}</code>
              </dd>
            </div>
            {capture?.env ? (
              <div>
                <dt>Env snapshot</dt>
                <dd>
                  temp={capture.env.temperature}, seed={capture.env.seed}, cap=$
                  {capture.env.costCapUsd}, grade={capture.env.grade ?? "—"}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <section className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>Per-task regression</h2>
        {comparison.perTask.length === 0 ? (
          <p className="hint">No per-task rows yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Baseline</th>
                  <th>Candidate</th>
                  <th>Delta</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {comparison.perTask.map((t) => (
                  <tr key={t.taskId}>
                    <td>
                      <code>{t.taskId}</code>
                    </td>
                    <td>{fmtScore(t.baselineScore)}</td>
                    <td>{fmtScore(t.candidateScore)}</td>
                    <td>
                      {t.delta !== null
                        ? `${t.delta >= 0 ? "+" : ""}${t.delta.toFixed(3)}`
                        : "—"}
                    </td>
                    <td>
                      {t.regression
                        ? "regression"
                        : t.improvement
                          ? "improved"
                          : "flat"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
