import Link from "next/link";
import { syncStatusFromResult } from "@skillevalator/core";
import { ComparisonPending } from "@/components/ComparisonPending";
import { EmptyState } from "@/components/EmptyState";
import { ComparisonHarnessCallouts } from "@/components/ComparisonHarnessCallouts";
import {
  ExportDownloadButton,
  ExportDownloadRow,
} from "@/components/ExportDownloadButton";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import {
  formatCaptureEnvEvidence,
  formatCaptureEnvSnapshot,
  formatCaptureGradePolicy,
} from "@/lib/captureEnvEvidence";
import { benefitListPairLockedLabel } from "@/lib/benefitListHints";
import { evaluationPairBrowseFromPacked } from "@/lib/evaluationPairBrowse";
import { officialComparisonExportGate } from "@/lib/comparisonExport";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { exportGateBlockMessage } from "@/lib/exportResolve";
import { healRunForRead } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import { comparisonVerdictBannerClass } from "@/lib/comparisonVerdictDisplay";
import {
  isPilotFocusParam,
  pairedEvalPreferOfficial,
  withNewRunHandoff,
  withPilotFocus,
} from "@/lib/pilotFocusHref";
import { statusBadgeClass } from "@/lib/status";

export const dynamic = "force-dynamic";

function fmtScore(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "—";
}

export default async function ComparisonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ evaluationId: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { evaluationId } = await params;
  const sp = await searchParams;
  const pilotFocus = isPilotFocusParam(sp.focus);
  const root = resultsDir();

  let invalid = false;
  let packed: ReturnType<typeof loadEvaluationComparison> | null = null;
  try {
    packed = loadEvaluationComparison(evaluationId);
    if (packed.meta?.baselineRunId) {
      healRunForRead(packed.meta.baselineRunId);
    }
    if (packed.meta?.candidateRunId) {
      healRunForRead(packed.meta.candidateRunId);
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
          <p className="eyebrow">
            <Link href={withPilotFocus("/comparison", pilotFocus)}>
              Unikie · Comparison
            </Link>
          </p>
          <h1>Evaluation not found</h1>
        </header>
        <div className="panel">
          <EmptyState
            title="Unknown evaluation"
            body="No paired baseline↔candidate evaluation with this id."
            actionHref={withPilotFocus("/comparison", pilotFocus)}
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
            <Link href={withPilotFocus("/comparison", pilotFocus)}>
              Comparison
            </Link>
            <span aria-hidden="true"> / </span>
            {evaluationId}
          </p>
        </header>
        {/* H1 lives in ComparisonPending so orphan-timeout updates the title. */}
        <ComparisonPending
          evaluationId={evaluationId}
          baselineRunId={baselineRunId}
          candidateRunId={candidateRunId}
          baselineStatus={baselineStatus}
          candidateStatus={candidateStatus}
          baselineHasResult={!!baseline}
          candidateHasResult={!!candidate}
          mode={meta.mode}
          baselineMode={baseline?.mode}
          candidateMode={candidate?.mode}
        />
      </div>
    );
  }

  const capture = comparison.capture;
  const pairBrowse = evaluationPairBrowseFromPacked(packed);
  const { pairEvidence, pairChip, pairBlocked } = pairBrowse;
  const baselineFakeProduce = pairEvidence.baselineFakeProduce;
  const candidateFakeProduce = pairEvidence.candidateFakeProduce;
  const baselineProduceAttested = pairEvidence.baselineProduceAttested;
  const candidateProduceAttested = pairEvidence.candidateProduceAttested;
  const downloadGate = officialComparisonExportGate(
    comparison,
    pairEvidence,
  );
  const showOfficialDownloads = downloadGate.ok;
  const downloadBlockReason = downloadGate.ok
    ? null
    : exportGateBlockMessage(downloadGate);
  const {
    comparisonMeta,
    comparisonProvisional,
    pairedDisplayMode: pairedDisplayModeFromUi,
  } = pairBrowse;
  const pairedDisplayMode = pairedDisplayModeFromUi ?? comparison.mode;
  const provisionalPass = Boolean(comparisonProvisional);
  const verdictHeadline = comparisonMeta?.label ?? comparison.verdict;
  const preferOfficial = pairedEvalPreferOfficial({
    metaMode: meta.mode,
    baselineMode: baseline?.mode,
    candidateMode: candidate?.mode,
  });
  const confirmOfficialPairHref = withNewRunHandoff(
    pilotFocus,
    preferOfficial,
  );
  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">
            <Link href={withPilotFocus("/comparison", pilotFocus)}>
              Comparison
            </Link>
            <span aria-hidden="true"> / </span>
            {evaluationId}
          </p>
          <h1>Baseline ↔ candidate</h1>
          <p>
            Skill <code>{comparison.evalSkillId}</code> · task set{" "}
            <code>{comparison.taskSetId}</code> · {pairedDisplayMode} ·{" "}
            <code>{comparison.modelId}</code>
          </p>
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle
            pathname="/comparison"
            pilotFocus={pilotFocus}
            detailHref={`/comparison/${evaluationId}`}
          />
          <Link
            className="btn btn-ghost"
            href={withPilotFocus(`/runs/${baselineRunId}`, pilotFocus)}
          >
            Baseline run
          </Link>
          <Link
            className="btn btn-ghost"
            href={withPilotFocus(`/runs/${candidateRunId}`, pilotFocus)}
          >
            Candidate run
          </Link>
          {showOfficialDownloads ? (
            <Link
              className="btn btn-primary"
              href={withPilotFocus(`/benefit/${candidateRunId}`, pilotFocus)}
            >
              Benefit Report
            </Link>
          ) : (
            <Link
              className="btn btn-ghost"
              href={withPilotFocus(`/benefit/${candidateRunId}`, pilotFocus)}
              title={
                downloadBlockReason ||
                (pairBlocked
                  ? "Pair evidence blocked (sibling smoke / unattested) — not adoption"
                  : "Benefit handoff locked until official Comparison PASS/FAIL")
              }
            >
              {pairBlocked || pairChip
                ? benefitListPairLockedLabel(pairChip)
                : "Benefit locked"}
            </Link>
          )}
          {showOfficialDownloads ? (
            <ExportDownloadRow>
              <ExportDownloadButton
                className="btn btn-ghost"
                href={`/api/comparison/${encodeURIComponent(evaluationId)}/csv`}
                filename={`${evaluationId}-comparison.csv`}
              >
                Download CSV
              </ExportDownloadButton>
              <ExportDownloadButton
                className="btn btn-ghost"
                href={`/api/comparison/${encodeURIComponent(evaluationId)}/archive`}
                filename={`${evaluationId}-pilot-archive.zip`}
                title="Zip tip legs + evaluation + MANIFEST (git SHA)"
              >
                Download pilot archive
              </ExportDownloadButton>
            </ExportDownloadRow>
          ) : (
            <p
              className="hint"
              style={{ margin: 0, maxWidth: "22rem" }}
              title={downloadBlockReason ?? undefined}
            >
              {downloadBlockReason}
            </p>
          )}
        </div>
      </header>

      <div className="panel callout-info">
        <strong>Comparison vs Benefit</strong>
        <p>
          <strong>{comparison.verdict}</strong> here is the paired lift gate
          (baseline↔candidate). Official PASS also needs candidate score ≥
          0.99 (Benefit USE floor), lift ≥ +5 pp, repeat scoreSpread ≤0.05 on
          both legs, no per-task regressions vs baseline, every candidate task
          soft-pass (≥0.8), and two independent official PASS pairs (1/2
          provisional). Benefit USE needs confirmed official PASS; DO NOT USE
          needs official FAIL
          {showOfficialDownloads ? (
            <>
              {" "}
              — open{" "}
              <Link
                href={withPilotFocus(`/benefit/${candidateRunId}`, pilotFocus)}
              >
                Benefit Report
              </Link>
              .
            </>
          ) : (
            <>
              {" "}
              — Benefit handoff locked until official PASS/FAIL without smoke /
              FAKE_PRODUCE.
            </>
          )}
        </p>
      </div>

      {pairedDisplayMode === "dry-run" ? (
        <div className="panel callout-warn">
          <strong>Dry-run only</strong>
          <p>
            Dry-run paired results stay INCONCLUSIVE for adoption (no PASS/FAIL).
            CSV export is locked until mode=official.
          </p>
        </div>
      ) : null}

      <ComparisonHarnessCallouts
        metaSmoke={meta.smoke === true}
        baselineFakeProduce={baselineFakeProduce}
        candidateFakeProduce={candidateFakeProduce}
        baselineProduceAttested={baselineProduceAttested}
        candidateProduceAttested={candidateProduceAttested}
        baselineRunId={baselineRunId}
        candidateRunId={candidateRunId}
        pilotFocus={pilotFocus}
      />

      {provisionalPass && comparison.adoptionConfirmation ? (
        <div className="panel callout-warn" style={{ marginTop: "1rem" }}>
          <strong>
            Provisional official PASS (
            {comparison.adoptionConfirmation.step}/
            {comparison.adoptionConfirmation.required})
          </strong>
          <p>
            This tip pair cleared lift, stability, and per-task gates. Benefit{" "}
            <strong>USE</strong> and CSV / pilot archive stay locked until a{" "}
            <strong>second independent official PASS</strong> on new baseline↔
            candidate tip legs.
          </p>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Link
              className="btn btn-primary btn-compact"
              href={confirmOfficialPairHref}
            >
              Confirm adoption — new official pair
            </Link>
          </div>
        </div>
      ) : null}

      <section
        className={comparisonVerdictBannerClass({
          verdict: comparison.verdict,
          displayMode: pairedDisplayMode,
          adoptionConfirmation: comparison.adoptionConfirmation,
        })}
      >
        <p className="eyebrow">
          Unikie paired verdict
          {pairedDisplayMode === "dry-run" ? " · dry-run" : ""}
        </p>
        <p className="verdict-headline">{verdictHeadline}</p>
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
                <span
                  className={statusBadgeClass(comparison.baselineStatus, true)}
                >
                  {comparison.baselineStatus}
                </span>
              </dd>
            </div>
            <div>
              <dt>Candidate status</dt>
              <dd>
                <span
                  className={statusBadgeClass(comparison.candidateStatus, true)}
                >
                  {comparison.candidateStatus}
                </span>
              </dd>
            </div>
            <div>
              <dt>Baseline produce</dt>
              <dd>
                {formatCaptureEnvEvidence({
                  fakeProduce: baseline.capture?.env?.fakeProduce,
                  produceAttested: baseline.capture?.env?.produceAttested,
                })}
              </dd>
            </div>
            <div>
              <dt>Candidate produce</dt>
              <dd>
                {formatCaptureEnvEvidence({
                  fakeProduce: candidate.capture?.env?.fakeProduce,
                  produceAttested: candidate.capture?.env?.produceAttested,
                })}
              </dd>
            </div>
            <div>
              <dt>Baseline grade</dt>
              <dd>
                {formatCaptureGradePolicy({
                  grade: baseline.capture?.env?.grade,
                  allowHostGrade: baseline.capture?.env?.allowHostGrade,
                })}
              </dd>
            </div>
            <div>
              <dt>Candidate grade</dt>
              <dd>
                {formatCaptureGradePolicy({
                  grade: candidate.capture?.env?.grade,
                  allowHostGrade: candidate.capture?.env?.allowHostGrade,
                })}
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
              <>
                <div>
                  <dt>Grade policy</dt>
                  <dd>
                    {formatCaptureGradePolicy({
                      grade: capture.env.grade,
                      allowHostGrade: capture.env.allowHostGrade,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>Env snapshot</dt>
                  <dd>
                    {formatCaptureEnvSnapshot({
                      temperature: capture.env.temperature,
                      seed: capture.env.seed,
                      costCapUsd: capture.env.costCapUsd,
                      grade: capture.env.grade,
                      allowHostGrade: capture.env.allowHostGrade,
                    })}
                    {capture.env.fakeProduce === true
                      ? " · FAKE_PRODUCE"
                      : capture.env.produceAttested === true
                        ? " · produceAttested"
                        : ""}
                  </dd>
                </div>
              </>
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
