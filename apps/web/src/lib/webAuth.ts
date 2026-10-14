/**
 * Edge-safe WEB_AUTH helpers (middleware + /api/auth).
 * Compare via SHA-256 digests so length/content timing does not leak the token.
 */

const enc = new TextEncoder();

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
  envValue: string | undefined = process.env.WEB_AUTH_TOKEN,
): WebAuthConfig {
  if (envValue === undefined) return { kind: "open" };
  const token = envValue.trim();
  if (!token) return { kind: "misconfigured" };
  return { kind: "required", token };
}

/** Constant-time equality of two UTF-8 strings (hash then XOR-diff digests). */
export async function timingSafeEqualUtf8(
  left: string,
  right: string,
): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(left)),
    crypto.subtle.digest("SHA-256", enc.encode(right)),
  ]);
  const a = new Uint8Array(ha);
  const b = new Uint8Array(hb);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Extract Bearer credential; null if header missing/malformed. */
export function bearerCredential(authorization: string | null): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim());
  return m?.[1] ?? null;
}

/**
 * Parse se_auth from a Cookie header (Node route handlers + middleware).
 * Last duplicate wins — matches typical browser Cookie jar behavior.
 */
export function parseSeAuthCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  let raw: string | undefined;
  const re = /(?:^|;\s*)se_auth=([^;]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cookieHeader)) !== null) {
    raw = m[1]!.trim();
  }
  if (raw === undefined) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * True when cookie or Bearer matches expected token.
 * Always evaluates both present channels (no early return on first hit).
 * Empty/whitespace expected never bypasses — callers use resolveWebAuthConfig
 * for the open-local case.
 */
export async function webAuthMatches(opts: {
  expected: string;
  cookie?: string | null;
  authorization?: string | null;
}): Promise<boolean> {
  const expected = opts.expected.trim();
  if (!expected) return false;

  const cookieVal = (opts.cookie ?? "").trim();
  const bearer = bearerCredential(opts.authorization ?? null);

  const [cookieOk, bearerOk] = await Promise.all([
    cookieVal
      ? timingSafeEqualUtf8(cookieVal, expected)
      : Promise.resolve(false),
    bearer ? timingSafeEqualUtf8(bearer, expected) : Promise.resolve(false),
  ]);
  return cookieOk || bearerOk;
}
