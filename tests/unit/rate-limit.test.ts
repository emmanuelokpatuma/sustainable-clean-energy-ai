import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { checkRateLimit, enforceRateLimit, _resetRateLimitsForTests } from "@/server/lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitsForTests();
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("key-a", 5, 60_000).allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("key-b", 5, 60_000);
    const result = checkRateLimit("key-b", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("key-c", 5, 60_000);
    // A different key should be unaffected by key-c's exhausted bucket.
    expect(checkRateLimit("key-d", 5, 60_000).allowed).toBe(true);
  });

  it("resets the count after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    for (let i = 0; i < 5; i++) checkRateLimit("key-e", 5, 60_000);
    expect(checkRateLimit("key-e", 5, 60_000).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z")); // 61s later, window is 60s
    expect(checkRateLimit("key-e", 5, 60_000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("retryAfterSeconds reflects the remaining time in the current window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    for (let i = 0; i < 3; i++) checkRateLimit("key-f", 3, 60_000);
    vi.setSystemTime(new Date("2026-01-01T00:00:40.000Z")); // 40s into a 60s window
    const result = checkRateLimit("key-f", 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(20); // 60 - 40
    vi.useRealTimers();
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitsForTests();
  });

  function fakeRequest(ip: string): NextRequest {
    return { headers: new Headers({ "x-forwarded-for": ip }) } as unknown as NextRequest;
  }

  it("returns null (allowed) under the limit", () => {
    const req = fakeRequest("1.2.3.4");
    expect(enforceRateLimit(req, "test-route", 3, 60_000)).toBeNull();
  });

  it("returns a 429 response with a Retry-After header once the limit is exceeded", async () => {
    const req = fakeRequest("5.6.7.8");
    enforceRateLimit(req, "test-route", 2, 60_000);
    enforceRateLimit(req, "test-route", 2, 60_000);
    const blocked = enforceRateLimit(req, "test-route", 2, 60_000);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("Retry-After")).toBeTruthy();
  });

  it("namespaces by routeKey so different routes don't share a bucket", () => {
    const req = fakeRequest("9.9.9.9");
    enforceRateLimit(req, "route-a", 1, 60_000);
    // route-a is now exhausted for this IP, but route-b should be untouched.
    expect(enforceRateLimit(req, "route-b", 1, 60_000)).toBeNull();
  });

  it("namespaces by IP so different clients don't share a bucket", () => {
    enforceRateLimit(fakeRequest("1.1.1.1"), "shared-route", 1, 60_000);
    expect(enforceRateLimit(fakeRequest("2.2.2.2"), "shared-route", 1, 60_000)).toBeNull();
  });
});
