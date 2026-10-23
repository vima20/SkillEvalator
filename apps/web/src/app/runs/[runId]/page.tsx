import Link from "next/link";
import {
  hasLiveJobFile,
  loadRunResult,
  loadRunStatus,
  syncStatusFromResult,
} from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { healRunForRead } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import {
  loadPairWaitingWindDownRunIds,
  loadRunDetailEvaluationPack,
} from "@/lib/runDetailEvaluationPack";
import { runDetailRetryAdmissionForRun } from "@/lib/runDetailRetryAdmission";
import { runPreflight } from "@/lib/runPreflight";
import { RunDetailClient } from "./RunDetailClient";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { runId } = await params;
  const sp = await searchParams;
  const pilotFocus = isPilotFocusParam(sp.focus);
  let status: ReturnType<typeof loadRunStatus> = null;
  let result: ReturnType<typeof loadRunResult> = null;
  let invalid = false;

  try {
    const root = resultsDir();
    healRunForRead(runId);
    result = loadRunResult(root, runId);
    status = syncStatusFromResult(root, runId);
  } catch {
    invalid = true;
  }

  if (invalid) {
    return (
      <div>
        <header className="page-header">
          <p className="eyebrow">
            <Link href={withPilotFocus("/runs", pilotFocus)}>
              Unikie · Runs
            </Link>
          </p>
          <h1>Invalid run</h1>
        </header>
        <div className="panel">
          <EmptyState
            title="Run id not allowed"
            body="The run id failed validation. Pick a run from the list."
            actionHref={withPilotFocus("/runs", pilotFocus)}
            actionLabel="Back to runs"
          />
        </div>
      </div>
    );
  }

  if (!status && !result) {
    return (
      <div>
        <header className="page-header">
          <p className="eyebrow">
            <Link href={withPilotFocus("/runs", pilotFocus)}>
              Unikie · Runs
            </Link>
          </p>
          <h1>Run not found</h1>
        </header>
        <div className="panel">
          <EmptyState
            title="No status or result"
            body="Nothing exists for this run id yet. Start a new evaluation or open an existing run."
            actionHref={withPilotFocus("/", pilotFocus)}
            actionLabel="Start a run"
          />
        </div>
      </div>
    );
  }

  const {
    evaluationId,
    tipCandidateRunId,
    pairHarness,
    pairPending,
    comparisonProvisional,
    comparisonMeta,
    pairedDisplayMode,
    metaMode,
    baselineMode,
    candidateMode,
    csvExportAllowed,
    csvExportBlockReason,
  } = loadRunDetailEvaluationPack({
    runId,
    result,
    status,
  });
  const pairWindDownRunIds = loadPairWaitingWindDownRunIds({
    pairPending,
    baselineRunId: pairHarness?.baselineRunId,
    candidateRunId: pairHarness?.candidateRunId,
  });

  const preflight = runPreflight();
  const retryAdmission = runDetailRetryAdmissionForRun({
    runId,
    result,
    status,
    preflight,
    healQueue: false,
  });

  return (
    <RunDetailClient
      runId={runId}
      pilotFocus={pilotFocus}
      initial={{
        runId,
        status,
        result,
        csvExportAllowed: csvExportAllowed ?? false,
        csvExportBlockReason: csvExportBlockReason ?? null,
        tipCandidateRunId,
        pairHarness,
        hasLiveJob: hasLiveJobFile(jobsDir(), runId),
        ...(pairPending ? { pairPending } : {}),
        ...(comparisonProvisional ? { comparisonProvisional } : {}),
        ...(comparisonMeta ? { comparisonMeta } : {}),
        ...(pairedDisplayMode ? { pairedDisplayMode } : {}),
        ...(metaMode ? { metaMode } : {}),
        ...(baselineMode ? { baselineMode } : {}),
        ...(candidateMode ? { candidateMode } : {}),
        ...(pairWindDownRunIds.length > 0 ? { pairWindDownRunIds } : {}),
        resolvedEvaluationId: evaluationId,
        retryAdmission,
      }}
    />
  );
}
