/**
 * UK postcode format validation. This is a FORMAT check only — it does not
 * confirm the postcode actually exists. Existence is confirmed by the
 * Postcodes.io adapter, which is the source of truth for "is this real".
 *
 * Regex based on the published UK government postcode specification
 * (the same pattern used by GOV.UK and Postcodes.io themselves).
 */
const UK_POSTCODE_REGEX =
  /^([Gg][Ii][Rr] 0[Aa]{2})|((([A-Za-z][0-9]{1,2})|(([A-Za-z][A-Ha-hJ-Yj-y][0-9]{1,2})|(([A-Za-z][0-9][A-Za-z])|([A-Za-z][A-Ha-hJ-Yj-y][0-9][A-Za-z]?))))\s?[0-9][A-Za-z]{2})$/;

export interface PostcodeValidationResult {
  isValid: boolean;
  normalized: string | null;
  reason?: string;
}

/**
 * Normalizes a raw user-entered postcode: trims, uppercases, and inserts the
 * single space before the inward code (e.g. "sw1a1aa" -> "SW1A 1AA").
 */
export function normalizePostcode(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (compact.length < 5) return compact;
  const inward = compact.slice(-3);
  const outward = compact.slice(0, -3);
  return `${outward} ${inward}`;
}

export function validatePostcode(raw: string): PostcodeValidationResult {
  if (!raw || typeof raw !== "string") {
    return { isValid: false, normalized: null, reason: "Postcode is required." };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { isValid: false, normalized: null, reason: "Postcode is required." };
  }
  if (trimmed.length > 8) {
    return {
      isValid: false,
      normalized: null,
      reason: "That doesn't look like a valid UK postcode (too long).",
    };
  }
  const normalized = normalizePostcode(trimmed);
  if (!UK_POSTCODE_REGEX.test(normalized)) {
    return {
      isValid: false,
      normalized: null,
      reason: "That doesn't look like a valid UK postcode.",
    };
  }
  return { isValid: true, normalized };
}

/** Returns only the outward part (e.g. "SW1A" from "SW1A 1AA") for privacy-safe storage. */
export function outwardPart(normalizedPostcode: string): string {
  return normalizedPostcode.split(" ")[0] ?? normalizedPostcode;
}
