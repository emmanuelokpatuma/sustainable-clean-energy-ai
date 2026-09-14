import { describe, it, expect, afterEach, vi } from "vitest";
import { PvgisAdapter, DEFAULT_SOLAR_ASSUMPTIONS } from "@/server/adapters/pvgisAdapter";
import { AdapterError } from "@/server/adapters/types";

describe("PvgisAdapter", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a normalised SolarAssessment in fixture mode", async () => {
    process.env.USE_FIXTURE_DATA = "true";
    const adapter = new PvgisAdapter();

    const result = await adapter.fetch({ latitude: 51.501, longitude: -0.1416 });

    expect(result.annualGenerationKwh).toBe(3170);
    expect(result.monthlyGenerationKwh).toHaveLength(12);
    expect(result.monthlyGenerationKwh[0]).toBe(100); // January
    expect(result.annualIrradiationKwhPerM2).toBe(1058);
    expect(result.confidence).toBe("modelled-estimate");
    expect(result.assumptions).toEqual(DEFAULT_SOLAR_ASSUMPTIONS);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result._meta.source).toBe("PVGIS");
    expect(result._meta.isFixture).toBe(true);
  });

  it("applies caller-supplied assumption overrides without mutating the defaults", async () => {
    process.env.USE_FIXTURE_DATA = "true";
    const adapter = new PvgisAdapter();

    const result = await adapter.fetch({
      latitude: 51.5,
      longitude: -0.14,
      assumptions: { peakPowerKw: 5, mountingType: "free" },
    });

    expect(result.assumptions.peakPowerKw).toBe(5);
    expect(result.assumptions.mountingType).toBe("free");
    expect(result.assumptions.tiltDeg).toBe(DEFAULT_SOLAR_ASSUMPTIONS.tiltDeg); // untouched
    expect(DEFAULT_SOLAR_ASSUMPTIONS.peakPowerKw).toBe(3.5); // module-level default unaffected
  });

  it("sends the resolved assumptions as PVGIS query parameters", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            outputs: {
              monthly: {
                fixed: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, E_m: 100 })),
              },
              totals: { fixed: { E_y: 1200, "H(i)_y": 1000 } },
            },
          }),
        } as unknown as Response);
      })
    );

    const adapter = new PvgisAdapter();
    await adapter.fetch({
      latitude: 51.5,
      longitude: -0.14,
      assumptions: { peakPowerKw: 6, tiltDeg: 40 },
    });

    expect(capturedUrl).toContain("lat=51.5");
    expect(capturedUrl).toContain("lon=-0.14");
    expect(capturedUrl).toContain("peakpower=6");
    expect(capturedUrl).toContain("angle=40");
    expect(capturedUrl).toContain("outputformat=json");
  });

  it("throws invalid_input when PVGIS returns 400 (location outside coverage)", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ status: "400 BAD REQUEST", message: "location outside coverage" }),
      } as unknown as Response)
    );

    const adapter = new PvgisAdapter();
    await expect(
      adapter.fetch({ latitude: 0, longitude: 0 })
    ).rejects.toMatchObject({ kind: "invalid_input" } satisfies Partial<AdapterError>);
  });

  it("does NOT retry a 400 (retrying a bad request wastes time and can't succeed)", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PvgisAdapter();
    await expect(adapter.fetch({ latitude: 0, longitude: 0 })).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws temporarily_unavailable when the network call fails", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const adapter = new PvgisAdapter();
    await expect(
      adapter.fetch({ latitude: 51.5, longitude: -0.14 })
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

    const adapter = new PvgisAdapter();
    await expect(
      adapter.fetch({ latitude: 51.5, longitude: -0.14 })
    ).rejects.toMatchObject({ kind: "unexpected_response_shape" });
  });

  it("throws unexpected_response_shape when fewer than 12 monthly entries are returned", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          outputs: {
            monthly: { fixed: [{ month: 1, E_m: 100 }] }, // only 1 of 12
            totals: { fixed: { E_y: 100, "H(i)_y": 50 } },
          },
        }),
      } as unknown as Response)
    );

    const adapter = new PvgisAdapter();
    await expect(
      adapter.fetch({ latitude: 51.5, longitude: -0.14 })
    ).rejects.toMatchObject({ kind: "unexpected_response_shape" });
  });
});
