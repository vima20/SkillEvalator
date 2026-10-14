/**
 * Shared WEB_AUTH_TOKEN resolution (web middleware + worker admission).
 * Timing-safe compare stays in apps/web (Web Crypto / edge).
 */

export type WebAuthConfig =
  | { kind: "open" }
  | { kind: "misconfigured" }
  | { kind: "required"; token: string };

/**
 * Resolve WEB_AUTH_TOKEN from env.
 * - unset → open local MVP (no lock)
 * - set but empty/whitespace after trim → misconfigured (fail-closed)
 * - non-empty after trim → required
 */
export function resolveWebAuthConfig(
  envValue: string | undefined,
): WebAuthConfig {
  if (envValue === undefined) return { kind: "open" };
  const token = envValue.trim();
  if (!token) return { kind: "misconfigured" };
  return { kind: "required", token };
}
