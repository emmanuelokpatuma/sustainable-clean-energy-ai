import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/server/lib/password";

describe("password hashing", () => {
  it("verifies a correct password against its own hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the password in plain text within the hash", async () => {
    const password = "correct-horse-battery-staple";
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });

  it("produces a different hash for the same password each time (random salt)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
    // But both still verify correctly against their own hash.
    expect(await verifyPassword("same-password", hash1)).toBe(true);
    expect(await verifyPassword("same-password", hash2)).toBe(true);
  });

  it("fails closed (returns false, does not throw) on a malformed stored hash", async () => {
    await expect(verifyPassword("anything", "not-a-valid-hash-format")).resolves.toBe(false);
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
  });
});
