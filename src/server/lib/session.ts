import { createHmac, timingSafeEqual } from "crypto";
import { randomBytes } from "crypto";

/**
 * A minimal signed-token session scheme (userId + expiry + HMAC signature),
 * not a full JWT library — this project needs exactly one claim (userId)
 * and one property (tamper-evidence + expiry), so a dedicated JWT
 * dependency would be more surface area than the problem needs. If this
 * project later needs standard claims, multiple audiences, or token
 * revocation lists, a real JWT library is the right call — this file is the
 * only place that would need to change.
 *
 * Token shape: "<userId>.<expiresAtMs>.<hmacHex>"
 */

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let devSecretWarningLogged = false;
let cachedDevSecret: string | null = null;

/**
 * Returns the signing secret. In production, `SESSION_SECRET` MUST be set —
 * this throws loudly at first use rather than silently signing with a weak
 * or predictable value. In development/test, falls back to a secret
 * generated once per process, which is fine for local work (and means
 * existing sessions won't survive a restart without a real secret set,
 * which is a deliberate nudge to set one rather than a bug).
 */
function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to a random value of at least 32 characters in production. Refusing to sign sessions with no secret or a weak one."
    );
  }

  if (!devSecretWarningLogged) {
    // eslint-disable-next-line no-console
    console.warn(
      "[session] SESSION_SECRET is not set — using a per-process random secret for local development. Sessions will not survive a server restart. Set SESSION_SECRET in .env before deploying."
    );
    devSecretWarningLogged = true;
  }
  cachedDevSecret ??= randomBytes(32).toString("hex");
  return cachedDevSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

export function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export interface VerifiedSession {
  userId: string;
}

/** Returns null for any malformed, tampered, or expired token — never throws on bad input. */
export function verifySessionToken(token: string | undefined | null): VerifiedSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, signature] = parts;
  if (!userId || !expiresAtStr || !signature) return null;

  const expectedSignature = sign(`${userId}.${expiresAtStr}`);
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { userId };
}

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000;
