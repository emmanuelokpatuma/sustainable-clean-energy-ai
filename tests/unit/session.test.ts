import { describe, it, expect, beforeAll, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "@/server/lib/session";

beforeAll(() => {
  // getSessionSecret() reads process.env.SESSION_SECRET fresh on each call
  // (only the dev-fallback random secret is cached), so setting this before
  // any call is enough — no special import ordering required.
  process.env.SESSION_SECRET = "a".repeat(32);
});

describe("session tokens", () => {
  it("verifies a token it just created", () => {
    const token = createSessionToken("user-123");
    const verified = verifySessionToken(token);
    expect(verified).toEqual({ userId: "user-123" });
  });

  it("rejects a tampered payload (different userId than what was signed)", () => {
    const token = createSessionToken("user-123");
    const [, expiresAt, signature] = token.split(".");
    const tampered = `user-456.${expiresAt}.${signature}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = createSessionToken("user-123");
    const [userId, expiresAt] = token.split(".");
    const tampered = `${userId}.${expiresAt}.${"0".repeat(64)}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
    const token = createSessionToken("user-123");
    vi.setSystemTime(new Date("2021-01-01T00:00:00.000Z")); // well past the 30-day expiry
    expect(verifySessionToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it("rejects malformed tokens without throwing", () => {
    expect(verifySessionToken("not-a-token")).toBeNull();
    expect(verifySessionToken("a.b")).toBeNull();
    expect(verifySessionToken("a.b.c.d")).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
  });

  it("produces different signatures for different users", () => {
    const tokenA = createSessionToken("user-a");
    const tokenB = createSessionToken("user-b");
    expect(tokenA).not.toBe(tokenB);
  });
});
