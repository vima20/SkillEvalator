import {
  healRunOrphansFs,
  loadRunResult,
  loadRunStatus,
  syncStatusFromResult,
} from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import {
  loadEvaluationComparison,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { runCsvExportAllowed } from "@/lib/runCsvExportAllowed";
import { RunDetailClient } from "./RunDetailClient";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  let status: ReturnType<typeof loadRunStatus> = null;
  let result: ReturnType<typeof loadRunResult> = null;
  let invalid = false;

  try {
    const root = resultsDir();
    healRunOrphansFs(jobsDir(), root, runId, isPidAlive);
    result = loadRunResult(root, runId);
    status = syncStatusFromResult(root, runId);
  } catch {
    invalid = true;
  }

  if (invalid) {
    return (
      <div>
        <header className="page-header">
          <p className="eyebrow">Unikie · Runs</p>
          <h1>Invalid run</h1>
        </header>
        <div className="panel">
          <EmptyState
            title="Run id not allowed"
            body="The run id failed validation. Pick a run from the list."
            actionHref="/runs"
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
          <p className="eyebrow">Unikie · Runs</p>
          <h1>Run not found</h1>
        </header>
        <div className="panel">
          <EmptyState
            title="No status or result"
            body="Nothing exists for this run id yet. Start a new evaluation or open an existing run."
            actionHref="/"
            actionLabel="Start a run"
          />
        </div>
      </div>
    );
  }

  const tipCandidateRunId = result?.evaluationId
    ? resolveTipCandidateRunId(loadEvaluationComparison(result.evaluationId))
    : null;

  return (
    <RunDetailClient
      runId={runId}
      initial={{
        runId,
        status,
        result,
        csvExportAllowed: runCsvExportAllowed(result),
        tipCandidateRunId,
      }}
    />
  );
}
