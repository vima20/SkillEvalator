import { loadRunResult, loadRunStatus } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { resultsDir } from "@/lib/paths";
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
    status = loadRunStatus(root, runId);
    result = loadRunResult(root, runId);
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

  return (
    <RunDetailClient
      runId={runId}
      initial={{ runId, status, result }}
    />
  );
}
