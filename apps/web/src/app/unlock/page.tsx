import { redirect } from "next/navigation";
import { resolveWebAuthConfig } from "@/lib/webAuth";

/**
 * Middleware lands here when WEB_AUTH_TOKEN is required (or misconfigured).
 * AuthGate in the root layout owns the unlock / misconfigured UI — this page
 * only redirects when auth is open so /unlock is not a dead end.
 */
export default function UnlockPage() {
  const auth = resolveWebAuthConfig(process.env.WEB_AUTH_TOKEN);
  if (auth.kind === "open") {
    redirect("/");
  }

  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      <p className="eyebrow">Access</p>
      <h1>Unlock required</h1>
      <p className="hint">
        AuthGate owns the unlock form above. If you still see this panel after
        unlocking, refresh the page.
      </p>
    </div>
  );
}
