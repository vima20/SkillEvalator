import { loadRunResult, loadRunStatus } from "@skillevalator/core";
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
          <h1>Invalid run</h1>
          <p>The run id is not allowed.</p>
        </header>
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
