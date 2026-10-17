import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AUTH_INVALID_REQUEST_ERROR,
  AUTH_INVALID_TOKEN_ERROR,
  AUTH_MISCONFIGURED_API_ERROR,
} from "@/lib/authResolve";
import {
  parseSeAuthCookie,
  resolveWebAuthConfig,
  timingSafeEqualUtf8,
  webAuthMatches,
} from "@/lib/webAuth";

const COOKIE = "se_auth";
const Body = z.object({ token: z.string().min(1) });

export async function GET(req: Request) {
  const auth = resolveWebAuthConfig(process.env.WEB_AUTH_TOKEN);
  if (auth.kind === "open") {
    return NextResponse.json({ required: false, ok: true });
  }
  if (auth.kind === "misconfigured") {
    return NextResponse.json({
      required: true,
      ok: false,
      misconfigured: true,
      errorCode: "auth_misconfigured",
    });
  }
  const ok = await webAuthMatches({
    expected: auth.token,
    cookie: parseSeAuthCookie(req.headers.get("cookie")),
    authorization: req.headers.get("authorization"),
  });
  return NextResponse.json({ required: true, ok });
}

export async function POST(req: Request) {
  const auth = resolveWebAuthConfig(process.env.WEB_AUTH_TOKEN);
  if (auth.kind === "open") {
    return NextResponse.json({ ok: true, required: false });
  }
  if (auth.kind === "misconfigured") {
    return NextResponse.json(
      {
        error: AUTH_MISCONFIGURED_API_ERROR,
        errorCode: "auth_misconfigured",
        misconfigured: true,
      },
      { status: 503 },
    );
  }
  try {
    const body = Body.parse(await req.json());
    if (!(await timingSafeEqualUtf8(body.token.trim(), auth.token))) {
      return NextResponse.json(
        {
          error: AUTH_INVALID_TOKEN_ERROR,
          errorCode: "auth_invalid_token",
        },
        { status: 401 },
      );
    }
    const res = NextResponse.json({ ok: true, required: true });
    res.cookies.set(COOKIE, auth.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch {
    return NextResponse.json(
      {
        error: AUTH_INVALID_REQUEST_ERROR,
        errorCode: "auth_invalid_request",
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
