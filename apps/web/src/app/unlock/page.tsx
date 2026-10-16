import { redirect } from "next/navigation";
import { resolveWebAuthConfig } from "@/lib/webAuth";

/**
 * Middleware lands here when WEB_AUTH_TOKEN is required (or misconfigured).
 * AuthGate owns the unlock UI — this route only redirects when auth is open.
 */
export default function UnlockPage() {
  const auth = resolveWebAuthConfig(process.env.WEB_AUTH_TOKEN);
  if (auth.kind === "open") {
    redirect("/");
  }
  return null;
}
