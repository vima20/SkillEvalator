"use client";

import { useEffect, useState, type ReactNode } from "react";
import { safeUnlockNext } from "@/lib/safeUnlockNext";

type AuthProbe = {
  required?: boolean;
  ok?: boolean;
  misconfigured?: boolean;
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
    if (data.misconfigured) {
      setNeeded(true);
      setMisconfigured(true);
      setCheckFailed(false);
      setError(
        "WEB_AUTH_TOKEN is misconfigured (empty or whitespace only). Set a real token in .env and restart web + worker.",
      );
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

  async function probeAuth(): Promise<void> {
    setCheckFailed(false);
    setError("");
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      if (!res.ok) {
        setNeeded(true);
        setMisconfigured(false);
        setCheckFailed(true);
        setError("Auth check failed — unlock or retry.");
        return;
      }
      applyProbe((await res.json()) as AuthProbe);
    } catch {
      setNeeded(true);
      setMisconfigured(false);
      setCheckFailed(true);
      setError(
        "Could not reach auth API — check that the web server is running.",
      );
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
        setError(
          "WEB_AUTH_TOKEN is misconfigured (empty or whitespace only). Set a real token in .env and restart web + worker.",
        );
      }
    }
    (async () => {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setNeeded(true);
          setMisconfigured(false);
          setCheckFailed(true);
          setError("Auth check failed — unlock or retry.");
          return;
        }
        applyProbe((await res.json()) as AuthProbe);
      } catch {
        if (!cancelled) {
          setNeeded(true);
          setMisconfigured(false);
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
          misconfigured?: boolean;
        };
        if (data.misconfigured) {
          setMisconfigured(true);
          setNeeded(true);
          setCheckFailed(false);
          throw new Error(
            data.error ??
              "WEB_AUTH_TOKEN misconfigured (empty or whitespace only)",
          );
        }
        throw new Error(data.error ?? "unauthorized");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
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
      ? "WEB_AUTH_TOKEN misconfigured"
      : checkFailed
        ? "Access check failed"
        : "Unlock SkillEvalator";
    const body = misconfigured
      ? "The access token env var is empty or whitespace-only. Edit root .env, set WEB_AUTH_TOKEN to a real secret (or remove it for open local use), then restart web + worker."
      : checkFailed
        ? "The browser could not confirm API access. Retry the check, or enter the access token from your admin."
        : "Enter the access token provided by your admin to unlock this local evaluator.";

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
