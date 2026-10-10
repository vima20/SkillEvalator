import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional shared-secret gate. Set WEB_AUTH_TOKEN in .env to require
 * Authorization: Bearer <token> (or cookie se_auth) for all routes.
 * Combined with binding to 127.0.0.1 for local-only MVP.
 */
export function middleware(req: NextRequest) {
  const token = process.env.WEB_AUTH_TOKEN?.trim();
  if (!token) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${token}`) return NextResponse.next();

  const cookie = req.cookies.get("se_auth")?.value;
  if (cookie === token) return NextResponse.next();

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
