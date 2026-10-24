import { apiFetch, UnauthorizedError } from "@/lib/apiFetch";
import { tryResolveAuthApiError } from "@/lib/authResolve";
import {
  comparisonExportProductFromHref,
  exportErrorPilotModeHint,
  resolveExportDownloadFetchError,
  resolveExportGetError,
  type ComparisonExportProduct,
  type ResolveExportGetErrorOpts,
} from "@/lib/exportResolve";

/** Parse Content-Disposition filename= / filename*= (RFC 5987). */
export function parseContentDispositionFilename(
  header: string | null,
): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"+|"+$/g, ""));
    } catch {
      return star[1].trim().replace(/^"+|"+$/g, "");
    }
  }
  const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(header);
  return plain?.[2]?.trim() || null;
}

/** Prefer API `error` / fail-closed `errorCode` from JSON export bodies. */
export function exportErrorFromJsonBody(
  body: unknown,
  statusFallback = resolveExportDownloadFetchError("failed"),
  opts?: ResolveExportGetErrorOpts,
): string | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as { error?: unknown; errorCode?: unknown };
  const error = typeof rec.error === "string" ? rec.error : undefined;
  const errorCode =
    typeof rec.errorCode === "string" ? rec.errorCode : undefined;
  if (!error?.trim() && !errorCode) return null;
  const base = resolveExportGetError(
    { error, errorCode },
    statusFallback,
    opts,
  );
  return base + exportErrorPilotModeHint(body);
}

export type DownloadExportResult =
  | { ok: true; filename: string }
  | { ok: false; error: string };

/**
 * Fetch an export URL and trigger a browser download.
 * Surfaces JSON error bodies instead of navigating to raw JSON.
 */
export async function downloadExport(
  href: string,
  fallbackFilename?: string,
): Promise<DownloadExportResult> {
  const comparisonProduct: ComparisonExportProduct =
    comparisonExportProductFromHref(href);
  const exportOpts: ResolveExportGetErrorOpts = { comparisonProduct };

  let res: Response;
  try {
    res = await apiFetch(href, {
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return { ok: false, error: e.message };
    }
    return {
      ok: false,
      error: resolveExportDownloadFetchError("network"),
    };
  }

  const ct = res.headers.get("content-type") ?? "";
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    const statusFallback = resolveExportDownloadFetchError("http", res.status);
    let error = statusFallback;
    if (isJson) {
      try {
        const body: unknown = await res.json();
        error =
          tryResolveAuthApiError(body) ??
          exportErrorFromJsonBody(body, statusFallback, exportOpts) ??
          statusFallback;
      } catch {
        /* keep status message */
      }
    }
    return { ok: false, error };
  }

  if (isJson) {
    const unexpected = resolveExportDownloadFetchError("unexpected_json");
    try {
      const body: unknown = await res.json();
      return {
        ok: false,
        error:
          tryResolveAuthApiError(body) ??
          exportErrorFromJsonBody(body, unexpected, exportOpts) ??
          unexpected,
      };
    } catch {
      return { ok: false, error: unexpected };
    }
  }

  try {
    const blob = await res.blob();
    const filename =
      parseContentDispositionFilename(res.headers.get("content-disposition")) ??
      fallbackFilename ??
      "download";

    if (typeof document === "undefined") {
      return { ok: true, filename };
    }

    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
    return { ok: true, filename };
  } catch {
    return {
      ok: false,
      error: resolveExportDownloadFetchError("failed"),
    };
  }
}
