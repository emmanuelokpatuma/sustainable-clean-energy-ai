import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * A fixed-window, in-memory rate limiter — deliberately simple, and
 * deliberately NOT a complete production solution. It closes the specific
 * gap SECURITY.md flagged as the single biggest concrete risk from Phase 9
 * (unlimited login/signup attempts), but has a real limitation worth being
 * upfront about: this Map lives in one server process's memory. It works
 * correctly for a single-instance deployment. It does NOT work correctly
 * across multiple server instances or serverless function invocations —
 * each has its own memory, so a limit of "5 per 15 minutes" becomes "5 per
 * 15 minutes per instance" the moment this app is horizontally scaled.
 * Production deployment behind a load balancer or serverless needs a shared
 * store (Redis, or the platform's own rate-limiting layer) instead of this
 * file — swapping the implementation is contained here since callers only
 * see `checkRateLimit()`'s return shape.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so long-running processes don't accumulate an
// unbounded number of stale IP entries. Not a perfect memory bound, but a
// reasonable one for V1 — swept every Nth call rather than on every call,
// since the cleanup itself iterates the whole map.
let callsSinceCleanup = 0;
const CLEANUP_INTERVAL_CALLS = 500;

function cleanupExpired(maxAgeMs: number) {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > maxAgeMs) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Only present when allowed is false. */
  retryAfterSeconds?: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  callsSinceCleanup++;
  if (callsSinceCleanup >= CLEANUP_INTERVAL_CALLS) {
    cleanupExpired(windowMs * 2);
    callsSinceCleanup = 0;
  }

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true };
}

/** Test-only escape hatch — production code never needs to reset this. */
export function _resetRateLimitsForTests() {
  buckets.clear();
  callsSinceCleanup = 0;
}

/**
 * Best-effort client identifier from standard proxy headers, falling back
 * to a constant when none are present (e.g. local dev without a proxy) —
 * meaning local requests all share one bucket, which is fine for
 * development and irrelevant in any real deployment sitting behind a
 * reverse proxy or platform load balancer that sets these headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Convenience wrapper for the common "check, and if blocked, return a 429"
 * pattern — used identically across the three routes this phase rate-limits
 * (login, signup, advisor/ask). Returns null when the request is allowed to
 * proceed; returns a ready-to-return NextResponse when it should be
 * rejected, so a route handler can write:
 * `const blocked = enforceRateLimit(...); if (blocked) return blocked;`
 */
export function enforceRateLimit(
  req: NextRequest,
  routeKey: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const result = checkRateLimit(`${routeKey}:${getClientIp(req)}`, limit, windowMs);
  if (result.allowed) return null;

  const response = NextResponse.json(
    { ok: false, message: "Too many requests. Please try again shortly." },
    { status: 429 }
  );
  if (result.retryAfterSeconds) {
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return response;
}
