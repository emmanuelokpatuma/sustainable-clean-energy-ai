import { CarbonIntensityAdapter } from "../adapters/carbonIntensityAdapter";
import { AdapterError } from "../adapters/types";
import type { CarbonIndexLabel } from "../calculations/greenScore";
import { logger } from "../lib/logger";

export interface EnergyNowData {
  current: {
    from: string;
    to: string;
    forecast: number | null;
    actual: number | null;
    index: CarbonIndexLabel;
  };
  forecast:
    | { available: true; periods: EnergyNowData["current"][] }
    | { available: false; reason: string };
  generationMix:
    | { available: true; mix: { fuel: string; percentage: number }[] }
    | { available: false; reason: string };
  source: string;
  retrievedAt: string; // ISO string, safe to serialize to the client
  isFixture: boolean;
}

export type CarbonIntensityServiceResult =
  | { ok: true; data: EnergyNowData }
  | { ok: false; errorKind: "unavailable"; message: string };

/**
 * The single entry point future phases (Energy Now UI, GreenScore's
 * electricity-carbon-optimisation component, the AI Advisor's grounding
 * context) should use to get current/forecast electricity carbon-intensity
 * information. Keeps adapter selection and error translation in one place —
 * the same shape as `LocationService` from Phase 1.
 *
 * Note: unlike `LocationService`, this does not take a location parameter.
 * The NESO Carbon Intensity API's national endpoints (`/intensity`,
 * `/generation`) are GB-wide and don't need one. A regional variant
 * (`/regional/postcode/{outcode}`) exists upstream and is a natural Phase 6+
 * extension — deliberately not built now, to avoid over-engineering a V1
 * feature that only needs the national figures (see PRODUCT_SPEC.md).
 */
export class CarbonIntensityService {
  private readonly adapter: CarbonIntensityAdapter;

  constructor(adapter: CarbonIntensityAdapter = new CarbonIntensityAdapter()) {
    this.adapter = adapter;
  }

  async getEnergyNow(options?: { forecastHours?: number }): Promise<CarbonIntensityServiceResult> {
    try {
      const result = await this.adapter.fetch({
        forecastHours: options?.forecastHours ?? 24,
      });

      return {
        ok: true,
        data: {
          current: result.current,
          forecast: result.forecast,
          generationMix: result.generationMix,
          source: result._meta.source,
          retrievedAt: result._meta.retrievedAt.toISOString(),
          isFixture: result._meta.isFixture,
        },
      };
    } catch (err) {
      if (err instanceof AdapterError) {
        logger.warn("Energy Now data unavailable", {
          kind: err.kind,
          source: err.source,
        });
        return {
          ok: false,
          errorKind: "unavailable",
          message:
            "Live electricity carbon-intensity data is temporarily unavailable. Please try again shortly.",
        };
      }
      logger.error("Unexpected error retrieving Energy Now data", { err: String(err) });
      return {
        ok: false,
        errorKind: "unavailable",
        message: "Something went wrong retrieving electricity carbon-intensity data.",
      };
    }
  }
}
