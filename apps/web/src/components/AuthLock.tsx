"use client";

import { useEffect, useState } from "react";
import { resolveAuthClientError } from "@/lib/authResolve";

/** Shows Lock when WEB_AUTH_TOKEN is active and the session cookie is set. */
export function AuthLock() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { required?: boolean; ok?: boolean };
        if (!cancelled && data.required && data.ok) setVisible(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="btn btn-ghost btn-compact auth-lock-btn"
        disabled={busy}
        aria-label="Lock session and require the access token again"
        title="Lock session"
        onClick={() => {
          if (
            !window.confirm(
              "Lock this session? You will need the access token again to continue.",
            )
          ) {
            return;
          }
          setBusy(true);
          setError(null);
          void (async () => {
            try {
              const res = await fetch("/api/auth", { method: "DELETE" });
              if (!res.ok) {
                setError(resolveAuthClientError("unreachable"));
                setBusy(false);
                return;
              }
              window.location.reload();
            } catch {
              setError(resolveAuthClientError("unreachable"));
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? "Locking…" : "Lock"}
      </button>
      {error ? (
        <p className="msg error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </span>
  );
}
