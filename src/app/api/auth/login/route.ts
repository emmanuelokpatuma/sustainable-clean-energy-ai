import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthService } from "@/server/services/authService";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/server/lib/session";
import { enforceRateLimit } from "@/server/lib/rateLimit";

const authService = new AuthService();

// 5 attempts per 15 minutes per IP. SECURITY.md flagged unlimited login
// attempts as the single biggest concrete risk introduced by Phase 9 —
// this is that fix. See rateLimit.ts's own comment for what this does and
// doesn't protect against (in particular: single-instance only).
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const blocked = enforceRateLimit(req, "auth-login", LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    // Same generic shape as a wrong password — a malformed email is not
    // meaningfully different information for an attacker than a real one
    // that doesn't exist, so there's no reason to distinguish them here.
    return NextResponse.json({ ok: false, message: "Invalid email or password." }, { status: 400 });
  }

  const result = await authService.logIn(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, user: result.user });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(result.user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
