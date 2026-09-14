import { describe, it, expect, vi } from "vitest";
import { AuthService } from "@/server/services/authService";
import { hashPassword } from "@/server/lib/password";

function mockDb(overrides: { existingUser?: { id: string; email: string; passwordHash: string } | null } = {}) {
  const findUnique = vi.fn().mockResolvedValue(overrides.existingUser ?? null);
  const create = vi.fn().mockImplementation(({ data, select }) => {
    // Mimic Prisma's `select` behaviour closely enough for these tests.
    const created = { id: "new-user-id", email: data.email, passwordHash: data.passwordHash };
    if (select) {
      const selected: Record<string, unknown> = {};
      for (const key of Object.keys(select)) selected[key] = (created as any)[key];
      return Promise.resolve(selected);
    }
    return Promise.resolve(created);
  });
  return { user: { findUnique, create } } as any;
}

describe("AuthService.signUp", () => {
  it("creates a user and never returns the password hash", async () => {
    const db = mockDb();
    const service = new AuthService(db);

    const result = await service.signUp("Test@Example.com", "a-fine-password");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("test@example.com"); // normalised to lowercase
      expect(Object.keys(result.user)).not.toContain("passwordHash");
    }
    expect(db.user.create).toHaveBeenCalledOnce();
  });

  it("rejects a password shorter than the minimum length without touching the database", async () => {
    const db = mockDb();
    const service = new AuthService(db);

    const result = await service.signUp("test@example.com", "short");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKind).toBe("invalid_input");
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("rejects signup with an email that's already registered", async () => {
    const db = mockDb({ existingUser: { id: "1", email: "test@example.com", passwordHash: "x" } });
    const service = new AuthService(db);

    const result = await service.signUp("test@example.com", "a-fine-password");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKind).toBe("conflict");
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("stores a hash, never the plain-text password", async () => {
    const db = mockDb();
    const service = new AuthService(db);

    await service.signUp("test@example.com", "a-fine-password");

    const createCall = db.user.create.mock.calls[0][0];
    expect(createCall.data.passwordHash).not.toBe("a-fine-password");
    expect(createCall.data.passwordHash).toContain(":"); // salt:hash format
  });
});

describe("AuthService.logIn", () => {
  it("logs in with correct credentials", async () => {
    const passwordHash = await hashPassword("a-fine-password");
    const db = mockDb({ existingUser: { id: "1", email: "test@example.com", passwordHash } });
    const service = new AuthService(db);

    const result = await service.logIn("test@example.com", "a-fine-password");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.email).toBe("test@example.com");
  });

  it("rejects a wrong password with a generic message", async () => {
    const passwordHash = await hashPassword("a-fine-password");
    const db = mockDb({ existingUser: { id: "1", email: "test@example.com", passwordHash } });
    const service = new AuthService(db);

    const result = await service.logIn("test@example.com", "wrong-password");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Invalid email or password.");
  });

  it("rejects a non-existent email with the SAME generic message as a wrong password", async () => {
    const db = mockDb({ existingUser: null });
    const service = new AuthService(db);

    const result = await service.logIn("nobody@example.com", "any-password");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Enumeration resistance: this message must be byte-for-byte identical
      // to the wrong-password case above, so a caller can't distinguish
      // "no such account" from "wrong password" by the response text.
      expect(result.message).toBe("Invalid email or password.");
    }
  });

  it("normalises email case before lookup", async () => {
    const passwordHash = await hashPassword("a-fine-password");
    const db = mockDb({ existingUser: { id: "1", email: "test@example.com", passwordHash } });
    const service = new AuthService(db);

    await service.logIn("Test@EXAMPLE.com", "a-fine-password");

    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: "test@example.com" } });
  });
});
