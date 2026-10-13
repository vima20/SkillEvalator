import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional shared-secret for API + pages when WEB_AUTH_TOKEN is set.
 * Leave empty for open local use. /api/auth stays open so the unlock form
 * can set the se_auth cookie; pages redirect to /unlock before RSC runs.
 */
export function middleware(req: NextRequest) {
  const token = process.env.WEB_AUTH_TOKEN?.trim();
  if (!token) return NextResponse.next();

  const { pathname } = req.nextUrl;

  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  const cookie = req.cookies.get("se_auth")?.value;
  const ok = auth === `Bearer ${token}` || cookie === token;

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
