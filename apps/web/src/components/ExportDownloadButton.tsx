"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { downloadExport } from "@/lib/exportDownload";
import { resolveExportDownloadFetchError } from "@/lib/exportResolve";

type ExportErrorApi = {
  reportError: (message: string | null) => void;
};

const ExportErrorContext = createContext<ExportErrorApi | null>(null);

/**
 * Shared alert for a row of export buttons (CSV + archive, md + csv, …).
 */
export function ExportDownloadRow(opts: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const reportError = useCallback((message: string | null) => {
    setError(message);
  }, []);

  return (
    <ExportErrorContext.Provider value={{ reportError }}>
      <span
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        {opts.children}
        {error ? (
          <p className="msg error" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}
      </span>
    </ExportErrorContext.Provider>
  );
}

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
  const shared = useContext(ExportErrorContext);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    if (shared) shared.reportError(null);
    else setLocalError(null);
    try {
      const result = await downloadExport(opts.href, opts.filename);
      if (!result.ok) {
        if (shared) shared.reportError(result.error);
        else setLocalError(result.error);
      }
    } catch {
      const msg = resolveExportDownloadFetchError("failed");
      if (shared) shared.reportError(msg);
      else setLocalError(msg);
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
      {!shared && localError ? (
        <p className="msg error" role="alert" style={{ margin: 0 }}>
          {localError}
        </p>
      ) : null}
    </span>
  );
}
