"use client";

import { useState } from "react";

export function BenefitActions({
  runId,
  markdown,
}: {
  runId: string;
  markdown: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyMd() {
    setError(null);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setError("Could not copy — use Download .md instead.");
    }
  }

  return (
    <div className="action-row">
      <button type="button" className="btn btn-ghost btn-compact" onClick={copyMd}>
        {copied ? "Copied" : "Copy Markdown"}
      </button>
      <a
        className="btn btn-primary btn-compact"
        href={`/api/runs/${encodeURIComponent(runId)}/benefit?format=md`}
        download={`${runId}-benefit.md`}
      >
        Download .md
      </a>
      <a
        className="btn btn-ghost btn-compact"
        href={`/api/runs/${encodeURIComponent(runId)}/benefit?format=csv`}
        download={`${runId}-benefit.csv`}
      >
        Download CSV
      </a>
      {error ? (
        <p className="msg error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
