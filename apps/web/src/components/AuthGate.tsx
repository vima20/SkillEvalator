"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AUTH_GATE_MISCONFIGURED_BODY,
  AUTH_GATE_MISCONFIGURED_TITLE,
  AUTH_GATE_PROBE_FAILED_BODY,
  AUTH_GATE_PROBE_FAILED_TITLE,
  AUTH_GATE_UNLOCK_BODY,
  AUTH_GATE_UNLOCK_TITLE,
  AUTH_MISCONFIGURED_ERROR,
  resolveAuthClientError,
  resolveAuthPostError,
  tryResolveAuthApiError,
} from "@/lib/authResolve";
import { safeUnlockNext } from "@/lib/safeUnlockNext";

type AuthProbe = {
  required?: boolean;
  ok?: boolean;
  misconfigured?: boolean;
  errorCode?: string;
  error?: string;
};

export function AuthGate({ children }: { children: ReactNode }) {
  const [needed, setNeeded] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [misconfigured, setMisconfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function applyProbe(data: AuthProbe) {
    if (data.misconfigured || data.errorCode === "auth_misconfigured") {
      setNeeded(true);
      setMisconfigured(true);
      setCheckFailed(false);
      setError(AUTH_MISCONFIGURED_ERROR);
      return;
    }
    setMisconfigured(false);
    if (data.required && !data.ok) {
      setNeeded(true);
      setCheckFailed(false);
    } else {
      setNeeded(false);
      setCheckFailed(false);
      setError("");
    }
  }

  /** GET /api/auth !ok — prefer auth JSON fail-closed over generic probe copy. */
  async function applyFailedProbe(res: Response): Promise<void> {
    const data = (await res.json().catch(() => ({}))) as AuthProbe;
    if (data.misconfigured || data.errorCode === "auth_misconfigured") {
      applyProbe(data);
      return;
    }
    setNeeded(true);
    setMisconfigured(false);
    setCheckFailed(true);
    const authMsg = tryResolveAuthApiError(data);
    if (authMsg) {
      setError(authMsg);
      return;
    }
    if (data.errorCode || data.error?.trim()) {
      setError(resolveAuthPostError(data));
      return;
    }
    setError(resolveAuthClientError("probe_failed"));
  }

  async function probeAuth(): Promise<void> {
    setCheckFailed(false);
    setError("");
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      if (!res.ok) {
        await applyFailedProbe(res);
        return;
      }
      applyProbe((await res.json()) as AuthProbe);
    } catch {
      setNeeded(true);
      setMisconfigured(false);
      setCheckFailed(true);
      setError(resolveAuthClientError("unreachable"));
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Middleware may land here with ?misconfigured=1 before the API probe.
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      if (q.get("misconfigured") === "1") {
        setMisconfigured(true);
        setNeeded(true);
        setError(AUTH_MISCONFIGURED_ERROR);
      }
    }
    (async () => {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          await applyFailedProbe(res);
          return;
        }
        applyProbe((await res.json()) as AuthProbe);
      } catch {
        if (!cancelled) {
          setNeeded(true);
          setMisconfigured(false);
          setCheckFailed(true);
          setError(resolveAuthClientError("unreachable"));
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
      if (misconfigured || (checkFailed && !token.trim())) {
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
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          errorCode?: string;
          misconfigured?: boolean;
        };
        if (data.misconfigured || data.errorCode === "auth_misconfigured") {
          setMisconfigured(true);
          setNeeded(true);
          setCheckFailed(false);
        }
        setError(resolveAuthPostError(data));
        return;
      }
      setCheckFailed(false);
      setMisconfigured(false);
      setNeeded(false);
      // Full navigation so middleware sees the new cookie before RSC.
      const params = new URLSearchParams(window.location.search);
      const next = safeUnlockNext(params.get("next"));
      if (
        window.location.pathname === "/unlock" ||
        window.location.pathname.startsWith("/unlock/")
      ) {
        window.location.assign(next);
        return;
      }
    } catch {
      setError(resolveAuthClientError("unreachable"));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div
        className="auth-boot"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        Loading…
      </div>
    );
  }

  if (needed) {
    const title = misconfigured
      ? AUTH_GATE_MISCONFIGURED_TITLE
      : checkFailed
        ? AUTH_GATE_PROBE_FAILED_TITLE
        : AUTH_GATE_UNLOCK_TITLE;
    const body = misconfigured
      ? AUTH_GATE_MISCONFIGURED_BODY
      : checkFailed
        ? AUTH_GATE_PROBE_FAILED_BODY
        : AUTH_GATE_UNLOCK_BODY;

    return (
      <main id="main-content" className="main" tabIndex={-1}>
        <div className="auth-gate">
          <form className="panel form-grid auth-card" onSubmit={unlock}>
            <p className="eyebrow">Unikie · Access</p>
            <h1>{title}</h1>
            <p className="skill-card-body">{body}</p>
            {misconfigured ? null : (
              <div className="field">
                <label htmlFor="webAuthToken">Access token</label>
                <input
                  id="webAuthToken"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required={!checkFailed}
                />
              </div>
            )}
            <div className="action-row">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy
                  ? "Checking…"
                  : misconfigured || (checkFailed && !token.trim())
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
      </main>
    );
  }

  return <>{children}</>;
}
