import { unlockNextFromRequest } from "@/lib/safeUnlockNext";

export class UnauthorizedError extends Error {
  constructor(message = "unauthorized — redirecting to unlock") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Build /unlock?next=… from the current page (focus=pilot preserved). */
export function unlockHrefFromLocation(
  pathname: string,
  search: string,
): string {
  if (pathname === "/unlock" || pathname.startsWith("/unlock/")) {
    return "/unlock";
  }
  const next = unlockNextFromRequest(
    pathname,
    new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
  );
  if (!next) return "/unlock";
  const params = new URLSearchParams();
  params.set("next", next);
  return `/unlock?${params.toString()}`;
}

/** Full navigation to unlock; no-op when already on /unlock. */
export function redirectToUnlock(): void {
  if (typeof window === "undefined") return;
  const href = unlockHrefFromLocation(
    window.location.pathname,
    window.location.search,
  );
  if (
    window.location.pathname === "/unlock" ||
    window.location.pathname.startsWith("/unlock/")
  ) {
    return;
  }
  window.location.assign(href);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Same-origin API fetch that sends expired sessions to /unlock
 * (preserves ?focus=pilot via next=). /api/auth is left alone.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  const url = requestUrl(input);
  if (url.includes("/api/auth")) return res;
  redirectToUnlock();
  throw new UnauthorizedError();
}
