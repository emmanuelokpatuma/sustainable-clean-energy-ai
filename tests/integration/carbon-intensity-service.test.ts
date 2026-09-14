import { describe, it, expect, vi } from "vitest";
import { CarbonIntensityService } from "@/server/services/carbonIntensityService";
import { CarbonIntensityAdapter } from "@/server/adapters/carbonIntensityAdapter";
import { AdapterError } from "@/server/adapters/types";

const samplePeriod = {
  from: "2026-09-14T11:00Z",
  to: "2026-09-14T11:30Z",
  forecast: 148,
  actual: 152,
  index: "moderate" as const,
};

describe("CarbonIntensityService.getEnergyNow (integration)", () => {
  it("returns a serializable snapshot for a successful adapter call", async () => {
    const adapter = new CarbonIntensityAdapter();
    vi.spyOn(adapter, "fetch").mockResolvedValue({
      current: samplePeriod,
      forecast: { available: true, periods: [samplePeriod] },
      generationMix: { available: true, mix: [{ fuel: "wind", percentage: 100 }] },
      _meta: { source: "NESO Carbon Intensity API", retrievedAt: new Date(), isFixture: true },
    });
    const service = new CarbonIntensityService(adapter);

    const result = await service.getEnergyNow();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.current.index).toBe("moderate");
      expect(typeof result.data.retrievedAt).toBe("string");
      expect(result.data.forecast.available).toBe(true);
    }
  });

  it("passes through a partial degradation (forecast unavailable) without treating it as a service failure", async () => {
    const adapter = new CarbonIntensityAdapter();
    vi.spyOn(adapter, "fetch").mockResolvedValue({
      current: samplePeriod,
      forecast: { available: false, reason: "Forecast electricity carbon-intensity data is temporarily unavailable." },
      generationMix: { available: true, mix: [] },
      _meta: { source: "NESO Carbon Intensity API", retrievedAt: new Date(), isFixture: false },
    });
    const service = new CarbonIntensityService(adapter);

    const result = await service.getEnergyNow();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.forecast.available).toBe(false);
      expect(result.data.current.actual).toBe(152); // current data still surfaced
    }
  });

  it("maps an AdapterError (current intensity unavailable) to a service-level failure, never fabricating data", async () => {
    const adapter = new CarbonIntensityAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(
      new AdapterError({
        kind: "temporarily_unavailable",
        source: "NESO Carbon Intensity API",
        message: "Could not reach NESO Carbon Intensity API.",
      })
    );
    const service = new CarbonIntensityService(adapter);

    const result = await service.getEnergyNow();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("unavailable");
      expect(result.message).toMatch(/temporarily unavailable/i);
    }
  });

  it("does not throw on an unexpected non-AdapterError, and degrades gracefully", async () => {
    const adapter = new CarbonIntensityAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(new Error("boom"));
    const service = new CarbonIntensityService(adapter);

    const result = await service.getEnergyNow();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("unavailable");
    }
  });
});
