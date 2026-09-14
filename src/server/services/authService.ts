import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/client";
import { hashPassword, verifyPassword } from "../lib/password";
import { logger } from "../lib/logger";

// Only the User methods this service actually uses — lets tests inject a
// minimal mock without depending on Prisma's generated types beyond this
// shape, same pattern as AiAdvisorService's injectable adapter.
type UserDb = Pick<PrismaClient, "user">;

export interface AuthUser {
  id: string;
  email: string;
}

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; errorKind: "invalid_input" | "conflict" | "unauthorized"; message: string };

const MIN_PASSWORD_LENGTH = 10;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthService {
  constructor(private readonly db: UserDb = prisma) {}

  async signUp(rawEmail: string, password: string): Promise<AuthResult> {
    const email = normaliseEmail(rawEmail);
    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        errorKind: "invalid_input",
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }

    const existing = await this.db.user.findUnique({ where: { email } });
    if (existing) {
      // Deliberately specific here (unlike login's generic message) —
      // "email already registered" doesn't reveal a password guess was
      // wrong, only that a signup with this address already happened,
      // which the person attempting to sign up already knows/suspects.
      return { ok: false, errorKind: "conflict", message: "An account with that email already exists." };
    }

    const passwordHash = await hashPassword(password);
    const user = await this.db.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });

    logger.info("User signed up", { userId: user.id });
    return { ok: true, user };
  }

  async logIn(rawEmail: string, password: string): Promise<AuthResult> {
    const email = normaliseEmail(rawEmail);
    const user = await this.db.user.findUnique({ where: { email } });

    // Same generic message whether the email doesn't exist or the password
    // is wrong — never reveal which one it was. This is a standard
    // enumeration-resistance measure, tested explicitly in
    // authService.test.ts.
    const genericFailure: AuthResult = {
      ok: false,
      errorKind: "unauthorized",
      message: "Invalid email or password.",
    };

    if (!user) return genericFailure;

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return genericFailure;

    return { ok: true, user: { id: user.id, email: user.email } };
  }
}
