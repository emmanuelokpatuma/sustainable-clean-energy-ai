import { PvgisAdapter, type SolarAssumptions } from "../adapters/pvgisAdapter";
import { AdapterError } from "../adapters/types";
import { logger } from "../lib/logger";

export interface SolarAssessmentData {
  annualGenerationKwh: number;
  monthlyGenerationKwh: number[];
  annualIrradiationKwhPerM2: number;
  systemLossPercent: number | null;
  assumptions: SolarAssumptions;
  confidence: "modelled-estimate";
  limitations: string[];
  source: string;
  retrievedAt: string; // ISO string, safe to serialize to the client
  isFixture: boolean;
}

export type SolarServiceResult =
  | { ok: true; assessment: SolarAssessmentData }
  | { ok: false; errorKind: "invalid_location" | "unavailable"; message: string };

/**
 * The single entry point future phases (SolarScore, GreenScore's renewable-
 * opportunity component, the AI Advisor's grounding context) should use to
 * get a modelled solar assessment for a resolved location. Same shape as
 * `LocationService` and `CarbonIntensityService`: validate/translate errors
 * here once, so callers just get a Result, never a thrown adapter exception.
 */
export class SolarService {
  private readonly adapter: PvgisAdapter;

  constructor(adapter: PvgisAdapter = new PvgisAdapter()) {
    this.adapter = adapter;
  }

  async getSolarAssessment(
    latitude: number,
    longitude: number,
    assumptions?: Partial<SolarAssumptions>
  ): Promise<SolarServiceResult> {
    try {
      const result = await this.adapter.fetch({ latitude, longitude, assumptions });

      return {
        ok: true,
        assessment: {
          annualGenerationKwh: result.annualGenerationKwh,
          monthlyGenerationKwh: result.monthlyGenerationKwh,
          annualIrradiationKwhPerM2: result.annualIrradiationKwhPerM2,
          systemLossPercent: result.systemLossPercent,
          assumptions: result.assumptions,
          confidence: result.confidence,
          limitations: result.limitations,
          source: result._meta.source,
          retrievedAt: result._meta.retrievedAt.toISOString(),
          isFixture: result._meta.isFixture,
        },
      };
    } catch (err) {
      if (err instanceof AdapterError) {
        logger.warn("Solar assessment unavailable", {
          kind: err.kind,
          source: err.source,
        });
        if (err.kind === "invalid_input") {
          return {
            ok: false,
            errorKind: "invalid_location",
            message:
              "We couldn't get solar data for this location — it may be outside the coverage area of the solar database we use.",
          };
        }
        return {
          ok: false,
          errorKind: "unavailable",
          message: "We couldn't retrieve solar data right now. Please try again in a moment.",
        };
      }
      logger.error("Unexpected error retrieving solar assessment", { err: String(err) });
      return {
        ok: false,
        errorKind: "unavailable",
        message: "Something went wrong retrieving solar data.",
      };
    }
  }
}
