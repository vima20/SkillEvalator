import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional shared-secret for /api/* (except /api/auth).
 * Set WEB_AUTH_TOKEN only when you want API gating; leave empty for local open use.
 * Pages always load without a token.
 */
export function middleware(req: NextRequest) {
  const token = process.env.WEB_AUTH_TOKEN?.trim();
  if (!token) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${token}`) return NextResponse.next();

  const cookie = req.cookies.get("se_auth")?.value;
  if (cookie === token) return NextResponse.next();

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
