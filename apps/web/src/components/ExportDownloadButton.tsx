"use client";

import { useState, type ReactNode } from "react";
import { downloadExport } from "@/lib/exportDownload";

/**
 * Download via fetch → blob so 401/409 JSON surfaces as an alert
 * instead of navigating the tab to raw API JSON.
 */
export function ExportDownloadButton(opts: {
  href: string;
  filename?: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const result = await downloadExport(opts.href, opts.filename);
      if (!result.ok) setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8 }}>
      <button
        type="button"
        className={opts.className}
        title={opts.title}
        disabled={busy}
        onClick={() => void onClick()}
      >
        {busy ? "Downloading…" : opts.children}
      </button>
      {error ? (
        <p className="msg error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </span>
  );
}
