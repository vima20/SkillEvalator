import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  parseSeAuthCookie,
  resolveWebAuthConfig,
  webAuthMatches,
} from "@/lib/webAuth";

/**
 * Optional shared-secret for API + pages when WEB_AUTH_TOKEN is set.
 * Unset → open local use. Whitespace-only / empty string → fail-closed
 * (misconfigured). /api/auth stays reachable so unlock + status work.
 */
export async function middleware(req: NextRequest) {
  const auth = resolveWebAuthConfig(process.env.WEB_AUTH_TOKEN);
  const { pathname } = req.nextUrl;

  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (auth.kind === "open") {
    return NextResponse.next();
  }

  if (auth.kind === "misconfigured") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "WEB_AUTH_TOKEN misconfigured (empty or whitespace only)",
          misconfigured: true,
        },
        { status: 503 },
      );
    }
    // Pages: send to unlock with a clear query flag (AuthGate / unlock UI).
    const dest = req.nextUrl.clone();
    dest.pathname = "/unlock";
    dest.search = "";
    dest.searchParams.set("misconfigured", "1");
    return NextResponse.redirect(dest);
  }

  const ok = await webAuthMatches({
    expected: auth.token,
    cookie: parseSeAuthCookie(req.headers.get("cookie")),
    authorization: req.headers.get("authorization"),
  });

  if (pathname === "/unlock" || pathname.startsWith("/unlock/")) {
    if (ok) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pages: redirect before RSC renders sensitive results/comparison HTML.
  const dest = req.nextUrl.clone();
  dest.pathname = "/unlock";
  dest.search = "";
  if (pathname && pathname !== "/") {
    dest.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(dest);
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next static assets and favicon.
     * Auth is a no-op when WEB_AUTH_TOKEN is unset.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
