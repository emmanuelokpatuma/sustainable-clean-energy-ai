import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Uses Node's built-in `crypto.scrypt` rather than a dedicated password
 * library like bcrypt or argon2. scrypt is a memory-hard KDF the Node.js
 * docs themselves recommend for password hashing, and using it means zero
 * added dependencies for something this security-sensitive — one less
 * native-binding package to keep updated. This is a deliberate V1 choice,
 * not an oversight: if this project later needs configurable work factors,
 * peer review from a security team, or parity with an existing
 * bcrypt-based user store, swapping in a dedicated library is a contained
 * change (this file is the only place that knows the hash format).
 *
 * Format: "<salt-hex>:<derived-key-hex>". Never log or return this value to
 * a client — see SECURITY.md.
 */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) return false;

  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(hashHex, "hex");

  // Different lengths would make timingSafeEqual throw rather than return
  // false — check first so a malformed stored hash fails closed, not with
  // an unhandled exception.
  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}
