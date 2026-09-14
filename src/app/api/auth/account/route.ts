import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/lib/auth";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/lib/password";
import { SESSION_COOKIE_NAME } from "@/server/lib/session";
import { logger } from "@/server/lib/logger";

const bodySchema = z.object({ password: z.string().min(1) });

/**
 * The account-deletion / "right to erasure" path PRIVACY.md commits to.
 * Requires re-entering the current password — a deliberate extra
 * confirmation step for an irreversible, cascading delete (see
 * prisma/schema.prisma's onDelete: Cascade chain from User through
 * Property to every score/recommendation/plan attached to it, and directly
 * from User to AiConversation).
 */
export async function DELETE(req: NextRequest) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return NextResponse.json({ ok: false, message: "You must be logged in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Your current password is required to delete your account." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ ok: false, message: "Incorrect password." }, { status: 401 });
  }

  await prisma.user.delete({ where: { id: currentUser.id } });
  logger.info("User account deleted", { userId: currentUser.id });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
