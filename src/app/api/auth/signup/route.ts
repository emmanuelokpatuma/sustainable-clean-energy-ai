import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthService } from "@/server/services/authService";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/server/lib/session";
import { enforceRateLimit } from "@/server/lib/rateLimit";

const authService = new AuthService();

// 3 accounts per hour per IP — anti-spam, not anti-brute-force (there's no
// password to guess on signup). Generous enough for a real person creating
// one or two accounts; well below what an automated signup-spam script
// would want.
const SIGNUP_LIMIT = 3;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1), // AuthService enforces the real minimum length with a specific message
});

/**
 * Only email + password are collected — no name, no address — per
 * PRIVACY.md's minimisation principle for account data.
 */
export async function POST(req: NextRequest) {
  const blocked = enforceRateLimit(req, "auth-signup", SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "A valid email and password are required." },
      { status: 400 }
    );
  }

  const result = await authService.signUp(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    const status = result.errorKind === "conflict" ? 409 : 400;
    return NextResponse.json({ ok: false, message: result.message }, { status });
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
