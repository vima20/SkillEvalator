"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ExportDownloadButton,
  ExportDownloadRow,
} from "@/components/ExportDownloadButton";
import { EXPORT_BENEFIT_LOCKED_FALLBACK } from "@/lib/exportResolve";
import { withPilotFocus } from "@/lib/pilotFocusHref";

export function BenefitActions({
  runId,
  markdown,
  evaluationId,
  exportAllowed,
  exportBlockReason,
  pilotFocus = false,
}: {
  runId: string;
  markdown: string;
  evaluationId?: string;
  /** False when recommendation is inconclusive (API also returns 409). */
  exportAllowed: boolean;
  /** Gate error text when exportAllowed is false (same as API 409). */
  exportBlockReason?: string | null;
  pilotFocus?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockedHint =
    exportBlockReason?.trim() || EXPORT_BENEFIT_LOCKED_FALLBACK;

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
      <Link
        className="btn btn-ghost btn-compact"
        href={withPilotFocus(`/runs/${runId}`, pilotFocus)}
      >
        Run detail
      </Link>
      {evaluationId ? (
        <Link
          className="btn btn-ghost btn-compact"
          href={withPilotFocus(`/comparison/${evaluationId}`, pilotFocus)}
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
          <ExportDownloadRow>
            <ExportDownloadButton
              className="btn btn-primary btn-compact"
              href={`/api/runs/${encodeURIComponent(runId)}/benefit?format=md`}
              filename={`${runId}-benefit.md`}
            >
              Download .md
            </ExportDownloadButton>
            <ExportDownloadButton
              className="btn btn-ghost btn-compact"
              href={`/api/runs/${encodeURIComponent(runId)}/benefit?format=csv`}
              filename={`${runId}-benefit.csv`}
            >
              Download CSV
            </ExportDownloadButton>
          </ExportDownloadRow>
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
