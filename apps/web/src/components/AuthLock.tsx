"use client";

import { useEffect, useState } from "react";

/** Shows Lock when WEB_AUTH_TOKEN is active and the session cookie is set. */
export function AuthLock() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <button
      type="button"
      className="btn btn-ghost btn-compact auth-lock-btn"
      disabled={busy}
      aria-label="Lock session and require the access token again"
      title="Lock session"
      onClick={() => {
        setBusy(true);
        void fetch("/api/auth", { method: "DELETE" }).finally(() => {
          window.location.reload();
        });
      }}
    >
      {busy ? "Locking…" : "Lock"}
    </button>
  );
}
