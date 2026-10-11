"use client";

import { useEffect, useState } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [needed, setNeeded] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function probeAuth(): Promise<void> {
    setCheckFailed(false);
    setError("");
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      if (!res.ok) {
        // Fail closed: do not render the app shell without a successful probe.
        setNeeded(true);
        setCheckFailed(true);
        setError("Auth check failed — unlock or retry.");
        return;
      }
      const data = (await res.json()) as { required?: boolean; ok?: boolean };
      if (data.required && !data.ok) {
        setNeeded(true);
      } else {
        setNeeded(false);
      }
    } catch {
      setNeeded(true);
      setCheckFailed(true);
      setError("Could not reach auth API — check that the web server is running.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setNeeded(true);
          setCheckFailed(true);
          setError("Auth check failed — unlock or retry.");
          return;
        }
        const data = (await res.json()) as { required?: boolean; ok?: boolean };
        if (data.required && !data.ok) {
          setNeeded(true);
        }
      } catch {
        if (!cancelled) {
          setNeeded(true);
          setCheckFailed(true);
          setError(
            "Could not reach auth API — check that the web server is running.",
          );
        }
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
      if (checkFailed && !token.trim()) {
        await probeAuth();
        setReady(true);
        return;
      }
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "unauthorized");
      }
      setCheckFailed(false);
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
          <h1>{checkFailed ? "Access check failed" : "Unlock SkillEvalator"}</h1>
          <p className="skill-card-body">
            {checkFailed
              ? "The browser could not confirm API access. Retry the check, or enter the shared token if WEB_AUTH_TOKEN is configured."
              : "WEB_AUTH_TOKEN is configured. Enter the shared token to use the API from this browser."}
          </p>
          <div className="field">
            <label htmlFor="webAuthToken">Shared token</label>
            <input
              id="webAuthToken"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required={!checkFailed}
            />
          </div>
          <div className="action-row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy
                ? "Checking…"
                : checkFailed && !token.trim()
                  ? "Retry check"
                  : "Unlock"}
            </button>
          </div>
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
