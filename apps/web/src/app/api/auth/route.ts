import { NextResponse } from "next/server";
import { z } from "zod";

const COOKIE = "se_auth";
const Body = z.object({ token: z.string().min(1) });

function configuredToken(): string {
  return process.env.WEB_AUTH_TOKEN?.trim() ?? "";
}

export async function GET(req: Request) {
  const token = configuredToken();
  if (!token) {
    return NextResponse.json({ required: false, ok: true });
  }
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)se_auth=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]!) : "";
  const auth = req.headers.get("authorization");
  const ok = value === token || auth === `Bearer ${token}`;
  return NextResponse.json({ required: true, ok });
}

export async function POST(req: Request) {
  const token = configuredToken();
  if (!token) {
    return NextResponse.json({ ok: true, required: false });
  }
  try {
    const body = Body.parse(await req.json());
    if (body.token !== token) {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, required: true });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
