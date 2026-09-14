import { describe, it, expect } from "vitest";
import { validatePostcode, normalizePostcode, outwardPart } from "@/server/lib/postcode";

describe("normalizePostcode", () => {
  it("uppercases and inserts a single space before the inward code", () => {
    expect(normalizePostcode("sw1a1aa")).toBe("SW1A 1AA");
  });

  it("collapses extra whitespace", () => {
    expect(normalizePostcode("  sw1a   1aa  ")).toBe("SW1A 1AA");
  });

  it("handles already-correct input idempotently", () => {
    expect(normalizePostcode("SW1A 1AA")).toBe("SW1A 1AA");
  });
});

describe("validatePostcode", () => {
  it("accepts a well-formed postcode", () => {
    const result = validatePostcode("SW1A 1AA");
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe("SW1A 1AA");
  });

  it("accepts a well-formed postcode without a space", () => {
    const result = validatePostcode("sw1a1aa");
    expect(result.isValid).toBe(true);
    expect(result.normalized).toBe("SW1A 1AA");
  });

  it("accepts a short-format postcode (e.g. EC1A 1BB style districts)", () => {
    const result = validatePostcode("M1 1AE");
    expect(result.isValid).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = validatePostcode("");
    expect(result.isValid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("rejects garbage input", () => {
    const result = validatePostcode("not a postcode");
    expect(result.isValid).toBe(false);
  });

  it("rejects input that is too long", () => {
    const result = validatePostcode("SW1A1AA1AA1AA1AA");
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/too long/i);
  });

  it("rejects a US zip code", () => {
    const result = validatePostcode("90210");
    expect(result.isValid).toBe(false);
  });
});

describe("outwardPart", () => {
  it("returns only the outward code", () => {
    expect(outwardPart("SW1A 1AA")).toBe("SW1A");
  });
});
