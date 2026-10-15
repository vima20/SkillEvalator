"use client";

import Link from "next/link";
import { useState } from "react";

export function BenefitActions({
  runId,
  markdown,
  evaluationId,
  exportAllowed,
  exportBlockReason,
}: {
  runId: string;
  markdown: string;
  evaluationId?: string;
  /** False when recommendation is inconclusive (API also returns 409). */
  exportAllowed: boolean;
  /** Gate error text when exportAllowed is false (same as API 409). */
  exportBlockReason?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockedHint =
    exportBlockReason?.trim() ||
    "Adoption export locked until official Comparison is decisive (USE needs PASS; DO NOT USE needs FAIL). API returns 409 otherwise.";

  async function copyMd() {
    setError(null);
    if (!exportAllowed) {
      setError(lockedHint);
      return;
    }
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
    <div className="action-row" style={{ flexWrap: "wrap", gap: 8 }}>
      <Link className="btn btn-ghost btn-compact" href={`/runs/${runId}`}>
        Run detail
      </Link>
      {evaluationId ? (
        <Link
          className="btn btn-ghost btn-compact"
          href={`/comparison/${evaluationId}`}
        >
          Comparison
        </Link>
      ) : null}
      {exportAllowed ? (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={copyMd}
          >
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
        </>
      ) : (
        <p className="hint" style={{ margin: 0 }} title={lockedHint}>
          {lockedHint}
        </p>
      )}
      {error ? (
        <p className="msg error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
