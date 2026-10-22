import Link from "next/link";
import { listRuns, syncStatusFromResult } from "@skillevalator/core";
import { ClearSmokeNoise } from "@/components/ClearSmokeNoise";
import { EmptyState } from "@/components/EmptyState";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { RunsAutoRefresh } from "@/components/RunsAutoRefresh";
import { benefitListPairLockedLabel } from "@/lib/benefitListHints";
import {
  evaluationPairBrowseFromPacked,
  pairExportEvidenceFromBrowse,
} from "@/lib/evaluationPairBrowse";
import { officialComparisonExportGate } from "@/lib/comparisonExport";
import { isPilotNoiseEvaluation } from "@/lib/comparisonListFocus";
import {
  comparisonVerdictChipTone,
  comparisonVerdictListLabel,
} from "@/lib/comparisonVerdictDisplay";
import { exportGateBlockMessage } from "@/lib/exportResolve";
import { healOrphansForBrowse } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import {
  listEvaluations,
  loadEvaluationComparison,
} from "@/lib/evaluations";
import { evaluationTipPairIsActive } from "@/lib/evaluationTipPair";
import { hasPendingEvaluations } from "@/lib/pendingEvaluations";
import {
  listWindDownRunIds,
  runIsActive,
  statusBadgeClass,
} from "@/lib/status";

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

export default async function ComparisonListPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const sp = await searchParams;
  const pilotFocus = isPilotFocusParam(sp.focus);

  healOrphansForBrowse();
  const root = resultsDir();
  const allRuns = listRuns(root);
  const hasActiveRuns = allRuns.some((r) =>
    runIsActive(r.status, !!r.result),
  );
  const windDownRunIds = listWindDownRunIds(allRuns);

  const allEvaluations = listEvaluations().map((e) => {
    const packed = loadEvaluationComparison(e.evaluationId);
    const c = packed.comparison;
    const pending = !c;
    // Prefer Comparison tip legs (then healed meta) so Benefit CTA matches PASS/FAIL.
    const pairBrowse = evaluationPairBrowseFromPacked(packed);
    const tipCandidateRunId =
      pairBrowse.tipCandidateRunId ?? e.candidateRunId;
    const tipBaselineRunId = pairBrowse.tipBaselineRunId ?? e.baselineRunId;
    const displayMode =
      pairBrowse.pairedDisplayMode ?? c?.mode ?? e.mode;
    const { pairEvidence, pairChip, pairBlocked, comparisonMeta } =
      pairBrowse;
    const baselineStatus =
      syncStatusFromResult(root, tipBaselineRunId)?.status ??
      packed.baseline?.status;
    const candidateStatus =
      syncStatusFromResult(root, tipCandidateRunId)?.status ??
      packed.candidate?.status;
    const baselineHasResult = Boolean(packed.baseline);
    const candidateHasResult = Boolean(packed.candidate);
    // Same gate as ComparisonPending / hasPendingEvaluations / Benefit.
    const tipActive = pending && evaluationTipPairIsActive(packed);
    const scorecardUnavailable = pending && !tipActive;
    const downloadGate = c
      ? officialComparisonExportGate(
          c,
          pairExportEvidenceFromBrowse(pairBrowse),
        )
      : null;
    const downloadsOk = downloadGate?.ok === true;
    return {
      ...e,
      pending,
      tipActive,
      scorecardUnavailable,
      verdict: c?.verdict ?? null,
      adoptionConfirmation: c?.adoptionConfirmation ?? null,
      lift: c?.lift ?? null,
      displayMode,
      baselineStatus,
      candidateStatus,
      baselineHasResult,
      candidateHasResult,
      candidateRunId: tipCandidateRunId,
      baselineFakeProduce: pairEvidence.baselineFakeProduce,
      candidateFakeProduce: pairEvidence.candidateFakeProduce,
      baselineProduceAttested: pairEvidence.baselineProduceAttested,
      candidateProduceAttested: pairEvidence.candidateProduceAttested,
      pairChip,
      pairBlocked,
      comparisonMeta,
      downloadsOk,
      benefitLockedReason:
        downloadGate && !downloadGate.ok
          ? exportGateBlockMessage(downloadGate)
          : null,
      noise: isPilotNoiseEvaluation({
        smoke: e.smoke,
        displayMode,
        verdict: c?.verdict ?? null,
        adoptionConfirmation: c?.adoptionConfirmation ?? null,
        baselineFakeProduce: pairEvidence.baselineFakeProduce,
        candidateFakeProduce: pairEvidence.candidateFakeProduce,
        baselineProduceAttested: pairEvidence.baselineProduceAttested,
        candidateProduceAttested: pairEvidence.candidateProduceAttested,
        baselineHasResult: Boolean(packed.baseline),
        candidateHasResult: Boolean(packed.candidate),
      }),
    };
  });

  const evaluations = pilotFocus
    ? allEvaluations.filter((e) => !e.noise)
    : allEvaluations;
  const hidden = allEvaluations.length - evaluations.length;
  const hasActive = hasActiveRuns || hasPendingEvaluations();

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · Test (paired)</p>
          <h1>Comparison</h1>
          <p>
            Baseline↔candidate lift on the same task set. Official{" "}
            <strong>PASS</strong> needs candidate ≥0.99 + lift, stability, and
            two independent tip pairs (first may show provisional{" "}
            <strong>1/2</strong>). Confirmed PASS unlocks Benefit{" "}
            <strong>USE</strong>. Dry-run stays{" "}
            <strong>INCONCLUSIVE</strong> (no adoption PASS/FAIL).
            {pilotFocus ? (
              <>
                {" "}
                <strong>Pilot focus</strong> hides dry-run, smoke / unattested
                tip legs, and non-handoff official INCONCLUSIVE (keeps
                provisional 1/2 visible)
                {hidden > 0 ? ` (${hidden} hidden)` : ""}.
              </>
            ) : null}
          </p>
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle pathname="/comparison" pilotFocus={pilotFocus} />
          <RunsAutoRefresh
            hasActive={hasActive}
            windDownRunIds={windDownRunIds}
          />
          {pilotFocus ? null : <ClearSmokeNoise />}
          <Link
            className="btn btn-primary"
            href={withPilotFocus("/", pilotFocus)}
          >
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
            title={
              allEvaluations.length === 0
                ? "No paired evaluations yet"
                : "No evaluations in pilot focus"
            }
            body={
              allEvaluations.length === 0
                ? "Start a run with baseline↔candidate enabled to queue both legs and open Comparison."
                : "All rows are dry-run, smoke, not_attested, FAKE_PRODUCE, pair-blocked, or official INCONCLUSIVE. Show all rows to inspect them."
            }
            actionHref={
              allEvaluations.length === 0
                ? withPilotFocus("/", pilotFocus)
                : "/comparison"
            }
            actionLabel={
              allEvaluations.length === 0 ? "New evaluation" : "Show all rows"
            }
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
                      <Link
                        href={withPilotFocus(
                          `/comparison/${e.evaluationId}`,
                          pilotFocus,
                        )}
                      >
                        {e.evaluationId}
                      </Link>
                      {e.pairChip ? (
                        <div className="cell-meta">{e.pairChip}</div>
                      ) : null}
                    </td>
                    <td>
                      <code>{e.evalSkillId}</code>
                      <div className="cell-meta">{e.displayMode}</div>
                    </td>
                    <td>
                      <span className="cell-meta">
                        <span
                          className={statusBadgeClass(
                            e.baselineStatus,
                            e.baselineHasResult,
                          )}
                        >
                          {e.baselineStatus ?? "—"}
                        </span>
                        {" / "}
                        <span
                          className={statusBadgeClass(
                            e.candidateStatus,
                            e.candidateHasResult,
                          )}
                        >
                          {e.candidateStatus ?? "—"}
                        </span>
                      </span>
                      {e.tipActive ? (
                        <div className="cell-meta">scorecard pending</div>
                      ) : e.scorecardUnavailable ? (
                        <div className="cell-meta">scorecard unavailable</div>
                      ) : null}
                    </td>
                    <td>
                      {e.verdict ? (
                        <span
                          className={`verdict-chip verdict-${comparisonVerdictChipTone(
                            {
                              verdict: e.verdict,
                              displayMode: e.displayMode,
                              adoptionConfirmation: e.adoptionConfirmation,
                            },
                          )}`}
                          title={e.comparisonMeta?.title}
                        >
                          {e.comparisonMeta?.label ??
                            comparisonVerdictListLabel({
                              verdict: e.verdict,
                              displayMode: e.displayMode,
                              adoptionConfirmation: e.adoptionConfirmation,
                            })}
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
                      {!e.candidateRunId ? (
                        <span
                          className="hint"
                          title={e.benefitLockedReason ?? undefined}
                        >
                          —
                        </span>
                      ) : e.tipActive ? (
                        e.candidateHasResult ? (
                          <Link
                            className="btn btn-ghost btn-compact"
                            href={withPilotFocus(
                              `/benefit/${e.candidateRunId}`,
                              pilotFocus,
                            )}
                            title="Candidate result ready — Benefit waiting for paired Comparison"
                          >
                            Benefit · waiting
                          </Link>
                        ) : (
                          <Link
                            className="btn btn-ghost btn-compact"
                            href={withPilotFocus(
                              `/runs/${e.candidateRunId}`,
                              pilotFocus,
                            )}
                            title="Tip candidate still running — open run (Benefit needs a result)"
                          >
                            Candidate run
                          </Link>
                        )
                      ) : e.scorecardUnavailable ? (
                        e.candidateHasResult ? (
                          <Link
                            className="btn btn-ghost btn-compact"
                            href={withPilotFocus(
                              `/benefit/${e.candidateRunId}`,
                              pilotFocus,
                            )}
                            title="No paired scorecard — open Benefit for Comparison unavailable detail"
                          >
                            Benefit · unavailable
                          </Link>
                        ) : (
                          <Link
                            className="btn btn-ghost btn-compact"
                            href={withPilotFocus(
                              `/runs/${e.candidateRunId}`,
                              pilotFocus,
                            )}
                            title="Tip candidate has no result.json — open run (Benefit needs a result)"
                          >
                            Candidate run
                          </Link>
                        )
                      ) : e.downloadsOk ? (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={withPilotFocus(
                            `/benefit/${e.candidateRunId}`,
                            pilotFocus,
                          )}
                        >
                          Benefit
                        </Link>
                      ) : (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={withPilotFocus(
                            `/benefit/${e.candidateRunId}`,
                            pilotFocus,
                          )}
                          title={
                            e.benefitLockedReason ??
                            e.comparisonMeta?.title ??
                            (e.pairBlocked
                              ? "Pair evidence blocked (sibling smoke / unattested) — not adoption"
                              : "Benefit handoff locked until official Comparison PASS/FAIL")
                          }
                        >
                          {e.pairBlocked || e.pairChip
                            ? benefitListPairLockedLabel(e.pairChip)
                            : "locked · handoff"}
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
