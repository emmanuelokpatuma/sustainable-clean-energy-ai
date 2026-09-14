import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { PostcodesIoAdapter } from "@/server/adapters/postcodesIoAdapter";
import { AdapterError } from "@/server/adapters/types";

describe("PostcodesIoAdapter", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a resolved location when USE_FIXTURE_DATA is true", async () => {
    process.env.USE_FIXTURE_DATA = "true";
    const adapter = new PostcodesIoAdapter();

    const result = await adapter.fetch({ normalizedPostcode: "SW1A 1AA" });

    expect(result.latitude).toBeCloseTo(51.501009, 4);
    expect(result.longitude).toBeCloseTo(-0.141588, 4);
    expect(result.region).toBe("London");
    expect(result.postcodeOutward).toBe("SW1A");
    expect(result._meta.source).toBe("Postcodes.io");
    expect(result._meta.isFixture).toBe(true);
  });

  it("throws invalid_input when the live API returns 404", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ status: 404, error: "Postcode not found" }),
      } as unknown as Response)
    );

    const adapter = new PostcodesIoAdapter();
    await expect(
      adapter.fetch({ normalizedPostcode: "ZZ99 9ZZ" })
    ).rejects.toMatchObject({ kind: "invalid_input" } satisfies Partial<AdapterError>);
  });

  it("throws temporarily_unavailable when the network call fails", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const adapter = new PostcodesIoAdapter();
    await expect(
      adapter.fetch({ normalizedPostcode: "SW1A 1AA" })
    ).rejects.toMatchObject({ kind: "temporarily_unavailable" });
  });

  it("throws unexpected_response_shape when the response doesn't match the schema", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ nonsense: true }),
      } as unknown as Response)
    );

    const adapter = new PostcodesIoAdapter();
    await expect(
      adapter.fetch({ normalizedPostcode: "SW1A 1AA" })
    ).rejects.toMatchObject({ kind: "unexpected_response_shape" });
  });
});
