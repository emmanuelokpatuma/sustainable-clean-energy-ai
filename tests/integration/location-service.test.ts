import { describe, it, expect, vi } from "vitest";
import { LocationService } from "@/server/services/locationService";
import { PostcodesIoAdapter } from "@/server/adapters/postcodesIoAdapter";
import { AdapterError } from "@/server/adapters/types";

describe("LocationService.resolvePostcode (integration)", () => {
  it("rejects an invalid postcode before ever calling the adapter", async () => {
    const adapter = new PostcodesIoAdapter();
    const fetchSpy = vi.spyOn(adapter, "fetch");
    const service = new LocationService(adapter);

    const result = await service.resolvePostcode("not a postcode");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("invalid_postcode");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a serializable location for a valid, resolvable postcode", async () => {
    const adapter = new PostcodesIoAdapter();
    vi.spyOn(adapter, "fetch").mockResolvedValue({
      latitude: 51.501009,
      longitude: -0.141588,
      adminDistrict: "Westminster",
      region: "London",
      postcodeOutward: "SW1A",
      _meta: { source: "Postcodes.io", retrievedAt: new Date(), isFixture: true },
    });
    const service = new LocationService(adapter);

    const result = await service.resolvePostcode("sw1a 1aa");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.location.postcodeOutward).toBe("SW1A");
      expect(typeof result.location.retrievedAt).toBe("string");
      expect(result.location.isFixture).toBe(true); // Phase 11: must propagate, not be dropped
    }
  });

  it("maps a not-found adapter error to errorKind 'not_found'", async () => {
    const adapter = new PostcodesIoAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(
      new AdapterError({
        kind: "invalid_input",
        source: "Postcodes.io",
        message: "That postcode could not be found.",
      })
    );
    const service = new LocationService(adapter);

    const result = await service.resolvePostcode("ZZ99 9ZZ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("not_found");
    }
  });

  it("maps a temporarily_unavailable adapter error to errorKind 'unavailable', never fabricating data", async () => {
    const adapter = new PostcodesIoAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(
      new AdapterError({
        kind: "temporarily_unavailable",
        source: "Postcodes.io",
        message: "Could not reach Postcodes.io.",
      })
    );
    const service = new LocationService(adapter);

    const result = await service.resolvePostcode("SW1A 1AA");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("unavailable");
    }
  });

  it("does not throw on an unexpected non-AdapterError, and degrades gracefully", async () => {
    const adapter = new PostcodesIoAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(new Error("boom"));
    const service = new LocationService(adapter);

    const result = await service.resolvePostcode("SW1A 1AA");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("unavailable");
    }
  });
});
