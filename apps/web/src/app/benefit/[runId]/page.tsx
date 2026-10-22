import Link from "next/link";
import {
  benefitReportToMarkdown,
  loadRunResult,
  syncStatusFromResult,
} from "@skillevalator/core";
import { BenefitPairWaitingRefresh } from "@/components/BenefitPairWaitingRefresh";
import { BenefitPending } from "@/components/BenefitPending";
import { ComparisonHarnessCallouts } from "@/components/ComparisonHarnessCallouts";
import { EmptyState } from "@/components/EmptyState";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { StarRating } from "@/components/StarRating";
import { comparisonUiFromPacked } from "@/lib/dashboardComparisonMeta";
import { comparisonVerdictBannerClass } from "@/lib/comparisonVerdictDisplay";
import { benefitExportGate } from "@/lib/benefitExport";
import { buildBenefitReportBundle } from "@/lib/benefitWithComparison";
import { exportGateBlockMessage } from "@/lib/exportResolve";
import { healRunForRead } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import {
  isPilotFocusParam,
  pairedEvalPreferOfficial,
  withNewRunHandoff,
  withPilotFocus,
} from "@/lib/pilotFocusHref";
import { listWindDownRunIds, statusBadgeClass } from "@/lib/status";
import { BenefitActions } from "./BenefitActions";

export const dynamic = "force-dynamic";

export default async function BenefitReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { runId } = await params;
  const sp = await searchParams;
  const pilotFocus = isPilotFocusParam(sp.focus);
  let result: ReturnType<typeof loadRunResult> = null;
  let runStatus: string | undefined;
  let invalid = false;

  let statusFile: ReturnType<typeof syncStatusFromResult> = null;
  try {
    const root = resultsDir();
    healRunForRead(runId);
    result = loadRunResult(root, runId);
    statusFile = syncStatusFromResult(root, runId);
    runStatus = statusFile?.status;
  } catch {
    invalid = true;
  }

  if (invalid) {
    return (
      <div>
        <header className="page-header">
          <p className="eyebrow">
            <Link href={withPilotFocus("/benefit", pilotFocus)}>
              Unikie · Benefit Report
            </Link>
          </p>
          <h1>Invalid run</h1>
        </header>
        <div className="panel">
          <EmptyState
            title="Run id not allowed"
            body="The run id failed validation. Use a run from the Benefit Report list."
            actionHref={withPilotFocus("/benefit", pilotFocus)}
            actionLabel="Back to Benefit Report"
          />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div>
        <header className="page-header">
          <p className="eyebrow">
            <Link href={withPilotFocus("/benefit", pilotFocus)}>
              Benefit Report
            </Link>
            <span aria-hidden="true"> / </span>
            {runId}
          </p>
        </header>
        {/* H1 lives in BenefitPending so orphan-timeout updates the title. */}
        <BenefitPending runId={runId} status={runStatus} />
      </div>
    );
  }

  const {
    report,
    comparison,
    meta,
    tipCandidateRunId,
    tipBaselineRunId,
    baseline,
    candidate,
    evaluationId: resolvedEvaluationId,
    pairPending,
  } = buildBenefitReportBundle(result, {
    runId,
    status: statusFile,
  });
  const markdown = benefitReportToMarkdown(report);
  const baselineFakeProduce = baseline?.capture?.env?.fakeProduce === true;
  const candidateFakeProduce = candidate?.capture?.env?.fakeProduce === true;
  const baselineProduceAttested =
    baseline?.capture?.env?.produceAttested === true;
  const candidateProduceAttested =
    candidate?.capture?.env?.produceAttested === true;
  const exportGate = benefitExportGate({
    report,
    comparison,
    metaSmoke: meta?.smoke === true,
    fakeProduce: result.capture?.env?.fakeProduce === true,
    baselineFakeProduce,
    candidateFakeProduce,
    baselineProduceAttested,
    candidateProduceAttested,
  });
  const exportAllowed = exportGate.ok;
  const exportBlockReason = exportGate.ok
    ? null
    : exportGateBlockMessage(exportGate);
  const supersededTip =
    tipCandidateRunId && tipCandidateRunId !== runId
      ? tipCandidateRunId
      : null;
  // Superseded non-tip must not show waiting/unavailable (adoption follows tip).
  const pairWaiting = !supersededTip && pairPending === "waiting";
  const pairUnavailable = !supersededTip && pairPending === "unavailable";
  // Tip legs beat stale evaluation.json (dry-run legs + official meta).
  const preferOfficial = pairedEvalPreferOfficial({
    metaMode: meta?.mode ?? comparison?.mode,
    baselineMode: baseline?.mode ?? (result.role === "baseline" ? result.mode : undefined),
    candidateMode:
      candidate?.mode ?? (result.role === "candidate" ? result.mode : undefined),
  });
  const {
    comparisonMeta,
    comparisonProvisional,
    pairedDisplayMode,
  } = comparisonUiFromPacked({ meta, baseline, candidate, comparison });
  const provisionalPass = Boolean(comparisonProvisional);
  const newRunHref = withNewRunHandoff(pilotFocus, preferOfficial);
  const harnessBaselineId = tipBaselineRunId ?? meta?.baselineRunId ?? "";
  const harnessCandidateId = tipCandidateRunId ?? meta?.candidateRunId ?? runId;
  const showHarness =
    Boolean(resolvedEvaluationId) &&
    Boolean(harnessBaselineId) &&
    Boolean(harnessCandidateId);
  // Sibling tip legs stuck in budget_stop without result.json (same as lists).
  const pairWindDownRunIds = (() => {
    if (!pairWaiting) return [] as string[];
    const root = resultsDir();
    return listWindDownRunIds(
      [tipBaselineRunId, tipCandidateRunId]
        .filter((id): id is string => Boolean(id))
        .map((id) => ({
          runId: id,
          status: syncStatusFromResult(root, id)?.status,
          result:
            id === tipBaselineRunId
              ? baseline
              : id === tipCandidateRunId
                ? candidate
                : null,
        })),
    );
  })();

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">
            <Link href={withPilotFocus("/benefit", pilotFocus)}>
              Benefit Report
            </Link>
            <span aria-hidden="true"> / </span>
            {runId}
          </p>
          <h1>{report.title}</h1>
          <p>{report.generatedAt}</p>
          {resolvedEvaluationId ? (
            <p className="run-subtitle">
              <Link
                href={withPilotFocus(
                  `/comparison/${resolvedEvaluationId}`,
                  pilotFocus,
                )}
                title={comparisonMeta?.title}
              >
                Comparison
                {comparisonMeta ? ` · ${comparisonMeta.label}` : null}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle
            pathname="/benefit"
            pilotFocus={pilotFocus}
            detailHref={`/benefit/${runId}`}
          />
          <BenefitActions
            runId={runId}
            markdown={markdown}
            evaluationId={resolvedEvaluationId ?? undefined}
            exportAllowed={exportAllowed}
            exportBlockReason={exportBlockReason}
            pilotFocus={pilotFocus}
          />
        </div>
      </header>

      {supersededTip ? (
        <div className="panel callout-warn">
          <strong>Superseded candidate leg</strong>
          <p>
            Comparison tip is{" "}
            <Link
              href={withPilotFocus(`/benefit/${supersededTip}`, pilotFocus)}
            >
              {supersededTip}
            </Link>
            .
            Adoption USE / DO NOT USE follow that tip only — this run stays
            INCONCLUSIVE.
          </p>
        </div>
      ) : null}

      {showHarness ? (
        <ComparisonHarnessCallouts
          metaSmoke={meta?.smoke === true}
          baselineFakeProduce={baselineFakeProduce}
          candidateFakeProduce={candidateFakeProduce}
          baselineProduceAttested={
            baseline?.capture?.env?.produceAttested === true
          }
          candidateProduceAttested={
            candidate?.capture?.env?.produceAttested === true
          }
          baselineRunId={harnessBaselineId}
          candidateRunId={harnessCandidateId}
          pilotFocus={pilotFocus}
        />
      ) : result.capture?.env?.fakeProduce === true ? (
        <div className="panel callout-warn">
          <strong>Smoke harness (FAKE_PRODUCE)</strong>
          <p>
            Scores on this run are not adoption evidence. Re-run with live
            model produce for Benefit USE / DO NOT USE.
          </p>
        </div>
      ) : result.capture?.env?.produceAttested !== true ? (
        <div className="panel callout-warn">
          <strong>Not produce-attested</strong>
          <p>
            This run is missing <code>produceAttested=true</code> (fixture /
            plant — not live worker evidence). Benefit export stays locked.
          </p>
        </div>
      ) : null}

      {result.role === "baseline" ? (
        <div className="panel callout-warn">
          <strong>Baseline leg</strong>
          <p>
            This is the neutral-prompt baseline, not a skill recommendation.
            Open{" "}
            {resolvedEvaluationId ? (
              <Link href={withPilotFocus(
                `/comparison/${resolvedEvaluationId}`,
                pilotFocus,
              )}>
                Comparison
              </Link>
            ) : (
              "Comparison"
            )}{" "}
            for PASS/FAIL lift, or the candidate Benefit Report.
          </p>
        </div>
      ) : result.role !== "candidate" ? (
        <div className="panel callout-warn">
          <strong>Missing eval role</strong>
          <p>
            This run has no explicit baseline/candidate role. Benefit adoption
            advice stays locked — re-run as a paired evaluation.
          </p>
        </div>
      ) : supersededTip ? null : pairUnavailable ? (
        <div className="panel callout-warn">
          <strong>Comparison unavailable</strong>
          <p>
            Tip legs finished without a usable paired scorecard, so Benefit
            stays <strong>INCONCLUSIVE</strong> — not USE / DO NOT USE.
            {resolvedEvaluationId ? (
              <>
                {" "}
                Open{" "}
                <Link
                  href={withPilotFocus(
                    `/comparison/${resolvedEvaluationId}`,
                    pilotFocus,
                  )}
                >
                  Comparison
                </Link>{" "}
                or{" "}
                <Link href={newRunHref}>
                  start a new baseline↔candidate run
                </Link>
                .
              </>
            ) : (
              <>
                {" "}
                <Link href={newRunHref}>
                  Start a new baseline↔candidate run
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="panel callout-info">
          <strong>
            {pairWaiting
              ? "Waiting for Comparison"
              : "Comparison vs Benefit"}
          </strong>
          <p>
            {pairWaiting ? (
              <>
                Candidate score is ready, but paired Comparison is not —
                Benefit stays <strong>INCONCLUSIVE</strong> until the sibling
                leg finishes.
                {resolvedEvaluationId ? (
                  <>
                    {" "}
                    (
                    <Link
                      href={withPilotFocus(
                        `/comparison/${resolvedEvaluationId}`,
                        pilotFocus,
                      )}
                    >
                      open Comparison
                    </Link>
                    )
                  </>
                ) : null}
              </>
            ) : provisionalPass ? (
              <>
                Official Comparison met adoption gates for this tip pair (
                <strong>
                  provisional PASS {comparisonProvisional!.step}/
                  {comparisonProvisional!.required}
                </strong>
                ). Benefit <strong>USE</strong> stays locked until a{" "}
                <strong>second independent official PASS</strong> on new tip
                legs.
                {resolvedEvaluationId ? (
                  <>
                    {" "}
                    (
                    <Link
                      href={withPilotFocus(
                        `/comparison/${resolvedEvaluationId}`,
                        pilotFocus,
                      )}
                    >
                      open Comparison
                    </Link>
                    )
                  </>
                ) : null}
              </>
            ) : (
              <>
                Benefit <strong>USE</strong> needs official paired{" "}
                <strong>Comparison PASS</strong>;{" "}
                <strong>DO NOT USE</strong> needs <strong>FAIL</strong>
                {resolvedEvaluationId ? (
                  <>
                    {" "}
                    (
                    <Link
                      href={withPilotFocus(
                        `/comparison/${resolvedEvaluationId}`,
                        pilotFocus,
                      )}
                    >
                      open Comparison
                    </Link>
                    )
                  </>
                ) : null}
                . Score alone is not adoption evidence.
              </>
            )}
          </p>
          {provisionalPass ? (
            <div className="action-row" style={{ marginTop: 12 }}>
              <Link
                className="btn btn-primary btn-compact"
                href={newRunHref}
              >
                Confirm adoption — new official pair
              </Link>
            </div>
          ) : null}
          {pairWaiting ? (
            <BenefitPairWaitingRefresh
              windDownRunIds={pairWindDownRunIds}
              pilotFocus={pilotFocus}
            />
          ) : null}
        </div>
      )}

      <section className="panel rating-hero">
        <StarRating
          stars={report.rating.stars}
          grade={report.rating.grade}
          summary={report.rating.summary}
        />
      </section>

      <section
        className={`panel ${
          comparison && pairedDisplayMode
            ? comparisonVerdictBannerClass({
                verdict: comparison.verdict,
                displayMode: pairedDisplayMode,
                adoptionConfirmation: comparison.adoptionConfirmation,
              })
            : `verdict-banner verdict-${report.verdict.recommendation}`
        }`}
      >
        <p className="eyebrow">Verdict</p>
        <h2 className="verdict-headline">{report.verdict.headline}</h2>
        <p className="verdict-decision">{report.verdict.decision}</p>
        <p className="verdict-rationale">{report.verdict.rationale}</p>
      </section>

      <section className="panel report-section">
        <h2>Written review</h2>
        <div className="written-review">
          {report.rating.reviewSections.map((section) => (
            <div key={section.heading} className="review-block">
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="panel callout-warn">
        <strong>Disclaimer</strong>
        <p>{report.disclaimer}</p>
      </div>

      <section className="panel report-section">
        <h2>Decision question</h2>
        <p className="decision-q">{report.decisionQuestion}</p>
      </section>

      <div className="stat-strip">
        <div className="stat">
          <span className="stat-label">Label</span>
          <span className="stat-value">{report.scorecard.label}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className="stat-value">{report.scorecard.score ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Spread</span>
          <span className="stat-value">
            {report.scorecard.scoreSpread.toFixed(3)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Tasks</span>
          <span className="stat-value">
            {report.scorecard.tasksPassed}/{report.scorecard.tasksTotal}
          </span>
        </div>
      </div>

      <section className="panel report-section">
        <h2>Scorecard</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Score</th>
                <th>Status</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {report.scorecard.perTask.map((t) => (
                <tr key={t.taskId}>
                  <td>
                    <code>{t.taskId}</code>
                  </td>
                  <td>{t.score ?? "—"}</td>
                  <td>
                    <span className={statusBadgeClass(t.status)}>{t.status}</span>
                  </td>
                  <td>
                    <strong>{t.label}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="panel report-section details-panel">
        <summary>Config</summary>
        <dl className="meta-list">
          <div>
            <dt>Mode</dt>
            <dd>
              <code>{report.config.mode}</code>
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>
              <code>{report.config.role ?? "—"}</code>
            </dd>
          </div>
          {report.config.evaluationId ? (
            <div>
              <dt>Evaluation</dt>
              <dd>
                <Link
                  href={withPilotFocus(
                    `/comparison/${report.config.evaluationId}`,
                    pilotFocus,
                  )}
                >
                  {report.config.evaluationId}
                </Link>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Model</dt>
            <dd>
              <code>{report.config.modelId}</code>
            </dd>
          </div>
          <div>
            <dt>Skill</dt>
            <dd>
              <code>{report.config.evalSkillId}</code>{" "}
              <code>{report.config.evalSkillVersion}</code>
            </dd>
          </div>
          <div>
            <dt>Commit / license</dt>
            <dd>
              <code>{report.config.commit ?? "—"}</code> ·{" "}
              {report.config.license ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Task set</dt>
            <dd>
              <code>{report.config.taskSetId}</code>
            </dd>
          </div>
          <div>
            <dt>Repeats</dt>
            <dd>
              {report.config.repeats} ({report.config.aggregate})
            </dd>
          </div>
          <div>
            <dt>Decoding</dt>
            <dd>
              temp={report.config.decoding.temperature}, top_p=
              {report.config.decoding.top_p}, seed=
              {report.config.decoding.seed ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Pipeline</dt>
            <dd>
              {report.config.pipeline.produce} → {report.config.pipeline.grade}
            </dd>
          </div>
          {report.config.evalSkillGithubUrl ? (
            <div>
              <dt>GitHub</dt>
              <dd>
                <a
                  href={report.config.evalSkillGithubUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {report.config.evalSkillGithubUrl}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </details>

      <details className="panel report-section details-panel">
        <summary>Harness checks</summary>
        <p>{report.harnessChecks.note}</p>
        <ul className="bullet-list">
          <li>
            Known-good fixtures:{" "}
            {report.harnessChecks.knownGoodSupported ? "yes" : "no"}
          </li>
          <li>
            Known-bad fixtures:{" "}
            {report.harnessChecks.knownBadSupported ? "yes" : "no"}
          </li>
        </ul>
      </details>

      <details className="panel report-section details-panel">
        <summary>Constraints</summary>
        <ul className="bullet-list">
          {report.constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>

      <details className="panel report-section details-panel">
        <summary>Cost</summary>
        <dl className="meta-list">
          <div>
            <dt>Status</dt>
            <dd>
              <span className={statusBadgeClass(report.cost.status)}>
                {report.cost.status}
              </span>
            </dd>
          </div>
          <div>
            <dt>Cost USD</dt>
            <dd>${report.cost.costUsd.toFixed(4)}</dd>
          </div>
          <div>
            <dt>Latency</dt>
            <dd>{Math.round(report.cost.latencyMs / 1000)}s</dd>
          </div>
          <div>
            <dt>Findings</dt>
            <dd>
              {report.cost.findings.length
                ? report.cost.findings.join("; ")
                : "(none)"}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
