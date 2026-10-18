import Link from "next/link";
import { listRuns, syncStatusFromResult } from "@skillevalator/core";
import { ClearSmokeNoise } from "@/components/ClearSmokeNoise";
import { EmptyState } from "@/components/EmptyState";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { RunsAutoRefresh } from "@/components/RunsAutoRefresh";
import {
  benefitListPairLockedLabel,
  benefitPairEvidenceFromPacked,
} from "@/lib/benefitListHints";
import {
  canShowOfficialComparisonDownloads,
  officialComparisonExportGate,
} from "@/lib/comparisonExport";
import { isPilotNoiseEvaluation } from "@/lib/comparisonListFocus";
import { exportGateBlockMessage } from "@/lib/exportResolve";
import { healOrphansForBrowse } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import {
  listEvaluations,
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
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
    const tipCandidateRunId =
      resolveTipCandidateRunId(packed) ?? e.candidateRunId;
    const tipBaselineRunId =
      resolveTipBaselineRunId(packed) ?? e.baselineRunId;
    // Chip/label mode from Comparison object (same source as detail), not stale meta.
    const displayMode = c?.mode ?? e.mode;
    const { pairEvidence, pairChip, pairBlocked } =
      benefitPairEvidenceFromPacked({
        tipBaselineRunId,
        tipCandidateRunId,
        metaSmoke: e.smoke === true,
        baseline: packed.baseline,
        candidate: packed.candidate,
      });
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
      ? officialComparisonExportGate(c, pairEvidence)
      : null;
    const downloadsOk = c
      ? canShowOfficialComparisonDownloads({
          comparison: {
            verdict: c.verdict,
            mode: displayMode,
          },
          ...pairEvidence,
        })
      : false;
    return {
      ...e,
      pending,
      tipActive,
      scorecardUnavailable,
      verdict: c?.verdict ?? null,
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
      downloadsOk,
      benefitLockedReason:
        downloadGate && !downloadGate.ok
          ? exportGateBlockMessage(downloadGate)
          : null,
      noise: isPilotNoiseEvaluation({
        smoke: e.smoke,
        displayMode,
        verdict: c?.verdict ?? null,
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
            <strong>PASS</strong> requires candidate ≥0.99 + lift and unlocks
            Benefit <strong>USE</strong>. Dry-run stays{" "}
            <strong>INCONCLUSIVE</strong> (no adoption PASS/FAIL).
            {pilotFocus ? (
              <>
                {" "}
                <strong>Pilot focus</strong> hides dry-run, smoke / unattested
                tip legs, and official INCONCLUSIVE
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
                      {e.tipActive || !e.candidateRunId ? (
                        <span
                          className="hint"
                          title={
                            e.tipActive
                              ? "Benefit after paired scorecard"
                              : (e.benefitLockedReason ?? undefined)
                          }
                        >
                          —
                        </span>
                      ) : e.scorecardUnavailable ? (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={withPilotFocus(
                            `/benefit/${e.candidateRunId}`,
                            pilotFocus,
                          )}
                          title="No paired scorecard — open Benefit for Comparison unavailable detail"
                        >
                          Candidate
                        </Link>
                      ) : e.downloadsOk ? (
                        <Link
                          className="btn btn-ghost btn-compact"
                          href={withPilotFocus(
                            `/benefit/${e.candidateRunId}`,
                            pilotFocus,
                          )}
                        >
                          Candidate
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
