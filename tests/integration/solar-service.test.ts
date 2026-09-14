import { describe, it, expect, vi } from "vitest";
import { SolarService } from "@/server/services/solarService";
import { PvgisAdapter, DEFAULT_SOLAR_ASSUMPTIONS } from "@/server/adapters/pvgisAdapter";
import { AdapterError } from "@/server/adapters/types";

const sampleResult = {
  annualGenerationKwh: 3170,
  monthlyGenerationKwh: Array(12).fill(264),
  annualIrradiationKwhPerM2: 1058,
  systemLossPercent: 18.9,
  assumptions: DEFAULT_SOLAR_ASSUMPTIONS,
  confidence: "modelled-estimate" as const,
  limitations: ["Modelled, not measured."],
  _meta: { source: "PVGIS", retrievedAt: new Date(), isFixture: true },
};

describe("SolarService.getSolarAssessment (integration)", () => {
  it("returns a serializable assessment for a successful adapter call", async () => {
    const adapter = new PvgisAdapter();
    vi.spyOn(adapter, "fetch").mockResolvedValue(sampleResult);
    const service = new SolarService(adapter);

    const result = await service.getSolarAssessment(51.5, -0.14);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assessment.annualGenerationKwh).toBe(3170);
      expect(typeof result.assessment.retrievedAt).toBe("string");
      expect(result.assessment.confidence).toBe("modelled-estimate");
    }
  });

  it("passes assumption overrides through to the adapter", async () => {
    const adapter = new PvgisAdapter();
    const fetchSpy = vi.spyOn(adapter, "fetch").mockResolvedValue(sampleResult);
    const service = new SolarService(adapter);

    await service.getSolarAssessment(51.5, -0.14, { peakPowerKw: 6 });

    expect(fetchSpy).toHaveBeenCalledWith({
      latitude: 51.5,
      longitude: -0.14,
      assumptions: { peakPowerKw: 6 },
    });
  });

  it("maps invalid_input (location outside coverage) to errorKind 'invalid_location', never fabricating a value", async () => {
    const adapter = new PvgisAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(
      new AdapterError({
        kind: "invalid_input",
        source: "PVGIS",
        message: "PVGIS rejected the request (status 400).",
      })
    );
    const service = new SolarService(adapter);

    const result = await service.getSolarAssessment(0, 0);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("invalid_location");
    }
  });

  it("maps temporarily_unavailable to errorKind 'unavailable'", async () => {
    const adapter = new PvgisAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(
      new AdapterError({
        kind: "temporarily_unavailable",
        source: "PVGIS",
        message: "Could not reach PVGIS.",
      })
    );
    const service = new SolarService(adapter);

    const result = await service.getSolarAssessment(51.5, -0.14);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("unavailable");
    }
  });

  it("does not throw on an unexpected non-AdapterError, and degrades gracefully", async () => {
    const adapter = new PvgisAdapter();
    vi.spyOn(adapter, "fetch").mockRejectedValue(new Error("boom"));
    const service = new SolarService(adapter);

    const result = await service.getSolarAssessment(51.5, -0.14);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe("unavailable");
    }
  });
});
