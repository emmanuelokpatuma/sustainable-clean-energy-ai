import { z } from "zod";
import { AdapterError, shouldUseFixtures, type DataAdapter } from "./types";
import { fetchJsonWithRetry } from "./httpClient";
import { getEnv } from "../lib/env";
import { logger } from "../lib/logger";
import currentFixture from "../../../tests/fixtures/carbon-intensity/current.json";
import forecastFixture from "../../../tests/fixtures/carbon-intensity/forecast.json";
import generationFixture from "../../../tests/fixtures/carbon-intensity/generation.json";

const SOURCE_NAME = "NESO Carbon Intensity API";

// The published index labels. Treated as a closed set deliberately — if NESO
// ever adds a new label, we want a loud parse failure, not a value silently
// passed through that our GreenScore/Energy Now logic doesn't know how to
// interpret (see CALCULATIONS.md).
const IntensityIndexSchema = z.enum(["very low", "low", "moderate", "high", "very high"]);

const IntensityPeriodSchema = z.object({
  from: z.string(),
  to: z.string(),
  intensity: z.object({
    forecast: z.number().nullable(),
    actual: z.number().nullable(),
    index: IntensityIndexSchema,
  }),
});

const IntensityResponseSchema = z.object({
  data: z.array(IntensityPeriodSchema),
});

const GenerationResponseSchema = z.object({
  data: z.object({
    from: z.string(),
    to: z.string(),
    generationmix: z.array(
      z.object({
        fuel: z.string(),
        perc: z.number(),
      })
    ),
  }),
});

export interface CarbonIntensityPeriod {
  from: string;
  to: string;
  forecast: number | null;
  actual: number | null;
  index: z.infer<typeof IntensityIndexSchema>;
}

export interface GenerationMixEntry {
  fuel: string;
  percentage: number;
}

export type ForecastResult =
  | { available: true; periods: CarbonIntensityPeriod[] }
  | { available: false; reason: string };

export type GenerationMixResult =
  | { available: true; mix: GenerationMixEntry[] }
  | { available: false; reason: string };

export interface CarbonIntensitySnapshot {
  current: CarbonIntensityPeriod;
  forecast: ForecastResult;
  generationMix: GenerationMixResult;
}

export interface CarbonIntensityInput {
  /** How far ahead to request forecast data. Default 24 hours. */
  forecastHours?: number;
}

function toPeriod(raw: z.infer<typeof IntensityPeriodSchema>): CarbonIntensityPeriod {
  return {
    from: raw.from,
    to: raw.to,
    forecast: raw.intensity.forecast,
    actual: raw.intensity.actual,
    index: raw.intensity.index,
  };
}

export class CarbonIntensityAdapter
  implements DataAdapter<CarbonIntensityInput, CarbonIntensitySnapshot>
{
  readonly sourceName = SOURCE_NAME;

  async fetch(input: CarbonIntensityInput) {
    const useFixtures = shouldUseFixtures();
    const forecastHours = input.forecastHours ?? 24;

    const current = await this.getCurrent(useFixtures);
    const forecast = await this.getForecast(current, forecastHours, useFixtures);
    const generationMix = await this.getGenerationMix(useFixtures);

    return {
      current,
      forecast,
      generationMix,
      _meta: {
        source: SOURCE_NAME,
        retrievedAt: new Date(),
        isFixture: useFixtures,
      },
    };
  }

  /** Current intensity is REQUIRED — if it can't be retrieved, the whole snapshot fails. */
  private async getCurrent(useFixtures: boolean): Promise<CarbonIntensityPeriod> {
    const json = useFixtures
      ? currentFixture
      : await fetchJsonWithRetry(
          `${getEnv().CARBON_INTENSITY_BASE_URL}/intensity`,
          SOURCE_NAME
        );

    const parsed = IntensityResponseSchema.safeParse(json);
    if (!parsed.success || parsed.data.data.length === 0) {
      throw new AdapterError({
        kind: "unexpected_response_shape",
        source: SOURCE_NAME,
        message: "Carbon Intensity API response did not match the expected shape.",
        cause: parsed.success ? undefined : parsed.error,
      });
    }
    return toPeriod(parsed.data.data[0]!);
  }

  /**
   * Forecast is BEST-EFFORT — if it fails, the caller still gets current
   * intensity. We never fabricate forecast numbers to fill the gap; we
   * report that the forecast is unavailable and let the UI say so.
   */
  private async getForecast(
    current: CarbonIntensityPeriod,
    forecastHours: number,
    useFixtures: boolean
  ): Promise<ForecastResult> {
    try {
      const json = useFixtures
        ? forecastFixture
        : await (async () => {
            const from = current.to;
            const to = new Date(
              new Date(current.to).getTime() + forecastHours * 60 * 60 * 1000
            ).toISOString();
            return fetchJsonWithRetry(
              `${getEnv().CARBON_INTENSITY_BASE_URL}/intensity/${from}/${to}`,
              SOURCE_NAME
            );
          })();

      const parsed = IntensityResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new AdapterError({
          kind: "unexpected_response_shape",
          source: SOURCE_NAME,
          message: "Carbon Intensity forecast response did not match the expected shape.",
          cause: parsed.error,
        });
      }
      return { available: true, periods: parsed.data.data.map(toPeriod) };
    } catch (err) {
      logger.warn("Carbon intensity forecast unavailable, degrading gracefully", {
        err: err instanceof AdapterError ? err.message : String(err),
      });
      return {
        available: false,
        reason: "Forecast electricity carbon-intensity data is temporarily unavailable.",
      };
    }
  }

  /** Generation mix is BEST-EFFORT — same graceful-degradation rule as forecast. */
  private async getGenerationMix(useFixtures: boolean): Promise<GenerationMixResult> {
    try {
      const json = useFixtures
        ? generationFixture
        : await fetchJsonWithRetry(
            `${getEnv().CARBON_INTENSITY_BASE_URL}/generation`,
            SOURCE_NAME
          );

      const parsed = GenerationResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new AdapterError({
          kind: "unexpected_response_shape",
          source: SOURCE_NAME,
          message: "Generation mix response did not match the expected shape.",
          cause: parsed.error,
        });
      }
      return {
        available: true,
        mix: parsed.data.data.generationmix.map((m) => ({
          fuel: m.fuel,
          percentage: m.perc,
        })),
      };
    } catch (err) {
      logger.warn("Generation mix unavailable, degrading gracefully", {
        err: err instanceof AdapterError ? err.message : String(err),
      });
      return {
        available: false,
        reason: "Electricity generation mix data is temporarily unavailable.",
      };
    }
  }
}
