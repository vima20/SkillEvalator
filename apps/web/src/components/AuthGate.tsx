"use client";

import { useEffect, useState } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [needed, setNeeded] = useState(false);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" });
        const data = (await res.json()) as { required?: boolean; ok?: boolean };
        if (cancelled) return;
        if (data.required && !data.ok) {
          setNeeded(true);
        }
      } catch {
        /* ignore — allow UI if auth check fails open for static shell */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "unauthorized");
      }
      setNeeded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className="auth-boot">Loading…</div>;
  }

  if (needed) {
    return (
      <div className="auth-gate">
        <form className="panel form-grid auth-card" onSubmit={unlock}>
          <p className="eyebrow">Unikie · Access</p>
          <h1>Unlock SkillEvalator</h1>
          <p className="skill-card-body">
            WEB_AUTH_TOKEN is configured. Enter the shared token to use the API
            from this browser.
          </p>
          <div className="field">
            <label htmlFor="webAuthToken">Shared token</label>
            <input
              id="webAuthToken"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Checking…" : "Unlock"}
          </button>
          {error ? (
            <p className="msg error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
