import type { NextRequest } from "next/server";
import { prisma } from "../db/client";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./session";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Verifies the session cookie AND checks the user still exists in the
 * database — a deleted account (see DELETE /api/auth/account) must stop
 * being treated as logged in immediately, not just once its token expires
 * up to 30 days later.
 */
export async function getCurrentUser(req: NextRequest): Promise<CurrentUser | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const verified = verifySessionToken(token);
  if (!verified) return null;

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { id: true, email: true },
  });
  return user;
}
