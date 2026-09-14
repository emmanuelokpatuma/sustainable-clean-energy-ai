import { describe, it, expect, afterEach, vi } from "vitest";
import { CarbonIntensityAdapter } from "@/server/adapters/carbonIntensityAdapter";
import { AdapterError } from "@/server/adapters/types";

describe("CarbonIntensityAdapter", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a full snapshot (current + forecast + generation mix) in fixture mode", async () => {
    process.env.USE_FIXTURE_DATA = "true";
    const adapter = new CarbonIntensityAdapter();

    const result = await adapter.fetch({});

    expect(result.current.index).toBe("moderate");
    expect(result.current.actual).toBe(152);
    expect(result.forecast.available).toBe(true);
    if (result.forecast.available) {
      expect(result.forecast.periods.length).toBeGreaterThan(0);
      // Future periods never have a fabricated "actual" value.
      expect(result.forecast.periods.every((p) => p.actual === null)).toBe(true);
    }
    expect(result.generationMix.available).toBe(true);
    if (result.generationMix.available) {
      const total = result.generationMix.mix.reduce((sum, m) => sum + m.percentage, 0);
      expect(total).toBeCloseTo(100, 1);
    }
    expect(result._meta.source).toBe("NESO Carbon Intensity API");
    expect(result._meta.isFixture).toBe(true);
  });

  it("throws when the current-intensity call fails — current is not optional", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const adapter = new CarbonIntensityAdapter();
    await expect(adapter.fetch({})).rejects.toMatchObject({
      kind: "temporarily_unavailable",
    } satisfies Partial<AdapterError>);
  });

  it("throws unexpected_response_shape when current intensity doesn't match the schema", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ nonsense: true }),
      } as unknown as Response)
    );

    const adapter = new CarbonIntensityAdapter();
    await expect(adapter.fetch({})).rejects.toMatchObject({
      kind: "unexpected_response_shape",
    });
  });

  it("degrades gracefully when forecast fails but current succeeds — never fabricates a forecast", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    const currentResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            from: "2026-09-14T11:00Z",
            to: "2026-09-14T11:30Z",
            intensity: { forecast: 148, actual: 152, index: "moderate" },
          },
        ],
      }),
    } as unknown as Response;

    const fetchMock = vi
      .fn()
      // 1st call: current intensity — succeeds
      .mockResolvedValueOnce(currentResponse)
      // 2nd call: forecast — fails
      .mockRejectedValueOnce(new Error("forecast endpoint down"))
      // 3rd call: generation mix — succeeds (not under test here, but must not throw)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: { from: "x", to: "y", generationmix: [{ fuel: "wind", perc: 100 }] },
        }),
      } as unknown as Response);

    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CarbonIntensityAdapter();
    const result = await adapter.fetch({});

    expect(result.current.index).toBe("moderate");
    expect(result.forecast.available).toBe(false);
    if (!result.forecast.available) {
      expect(result.forecast.reason).toBeTruthy();
    }
    expect(result.generationMix.available).toBe(true);
  });

  it("degrades gracefully when generation mix fails but current and forecast succeed", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    const okIntensityResponse = (data: unknown) =>
      ({ ok: true, status: 200, json: async () => ({ data }) } as unknown as Response);

    const currentPeriod = {
      from: "2026-09-14T11:00Z",
      to: "2026-09-14T11:30Z",
      intensity: { forecast: 148, actual: 152, index: "moderate" },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okIntensityResponse([currentPeriod]))
      .mockResolvedValueOnce(okIntensityResponse([currentPeriod]))
      .mockRejectedValueOnce(new Error("generation endpoint down"));

    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CarbonIntensityAdapter();
    const result = await adapter.fetch({});

    expect(result.forecast.available).toBe(true);
    expect(result.generationMix.available).toBe(false);
    if (!result.generationMix.available) {
      expect(result.generationMix.reason).toBeTruthy();
    }
  });

  it("requests the forecast range using minute-precision timestamps (no seconds/milliseconds), matching NESO's documented format", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    const currentResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            from: "2026-09-14T11:00Z",
            to: "2026-09-14T11:30Z",
            intensity: { forecast: 148, actual: 152, index: "moderate" },
          },
        ],
      }),
    } as unknown as Response;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(currentResponse) // current
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) } as unknown as Response); // forecast + generation (shape doesn't matter here)

    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CarbonIntensityAdapter();
    await adapter.fetch({ forecastHours: 24 });

    const forecastUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(forecastUrl).toContain("/intensity/2026-09-14T11:30Z/2026-09-15T11:30Z");
    expect(forecastUrl).not.toMatch(/\.\d{3}Z/); // no milliseconds
  });

  it("retries once on a 5xx before failing", async () => {
    process.env.USE_FIXTURE_DATA = "false";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              from: "2026-09-14T11:00Z",
              to: "2026-09-14T11:30Z",
              intensity: { forecast: 148, actual: 152, index: "moderate" },
            },
          ],
        }),
      } as unknown as Response)
      // Fallback for the forecast + generation-mix calls that follow. Shape
      // doesn't match either schema, so both degrade to "unavailable" — that's
      // fine, this test only cares about the current-intensity retry.
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CarbonIntensityAdapter();
    const result = await adapter.fetch({});

    expect(result.current.actual).toBe(152);
    // 2 attempts for current (503 then success) + 1 for forecast + 1 for generation mix.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
