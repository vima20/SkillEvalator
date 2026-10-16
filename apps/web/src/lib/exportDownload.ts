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

/** Prefer API `error` string from JSON 401/409 bodies. */
export function exportErrorFromJsonBody(body: unknown): string | null {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    const msg = (body as { error: string }).error.trim();
    return msg || null;
  }
  return null;
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
  let res: Response;
  try {
    res = await fetch(href, { cache: "no-store", credentials: "same-origin" });
  } catch {
    return { ok: false, error: "Download failed — network error" };
  }

  const ct = res.headers.get("content-type") ?? "";
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    let error = `Download failed (${res.status})`;
    if (isJson) {
      try {
        const body: unknown = await res.json();
        error = exportErrorFromJsonBody(body) ?? error;
      } catch {
        /* keep status message */
      }
    }
    return { ok: false, error };
  }

  if (isJson) {
    try {
      const body: unknown = await res.json();
      return {
        ok: false,
        error:
          exportErrorFromJsonBody(body) ??
          "Unexpected JSON response (export locked or unauthorized)",
      };
    } catch {
      return {
        ok: false,
        error: "Unexpected JSON response (export locked or unauthorized)",
      };
    }
  }

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
}
