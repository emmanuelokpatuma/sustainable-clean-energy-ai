import { z } from "zod";
import { AdapterError, shouldUseFixtures, type DataAdapter } from "./types";
import { fetchJsonWithRetry } from "./httpClient";
import { getEnv } from "../lib/env";
import successFixture from "../../../tests/fixtures/pvgis/pvcalc-success.json";

const SOURCE_NAME = "PVGIS";

/**
 * Configurable system assumptions used when calling PVGIS, kept in one place
 * (per PRODUCT_SPEC.md: "add configurable assumptions rather than hard-coding
 * them throughout the application"). These describe a typical small UK
 * residential system — NOT the user's actual roof, which we don't know
 * anything about yet. Every `SolarAssessment` this adapter produces echoes
 * back exactly which assumptions were used, so nothing is silently guessed
 * on the caller's behalf.
 */
export interface SolarAssumptions {
  /** System size in kWp. 3.5 kWp is a common small UK residential array. */
  peakPowerKw: number;
  /** System losses (%): inverter, wiring, soiling, etc. PVGIS's own default. */
  lossPercent: number;
  /** Panel tilt from horizontal, in degrees. 35° is close to optimal for the UK. */
  tiltDeg: number;
  /** Panel azimuth: 0 = south, -90 = east, 90 = west, 180 = north. */
  azimuthDeg: number;
  /** "building" (roof-mounted) or "free" (free-standing). */
  mountingType: "building" | "free";
  /** Which PVGIS solar radiation database to use. */
  radiationDatabase: string;
}

export const DEFAULT_SOLAR_ASSUMPTIONS: SolarAssumptions = {
  peakPowerKw: 3.5,
  lossPercent: 14,
  tiltDeg: 35,
  azimuthDeg: 0,
  mountingType: "building",
  radiationDatabase: "PVGIS-SARAH2",
};

// Deliberately narrow: only the fields SolarAssessment actually uses. PVGIS's
// full response includes an `inputs` echo and `meta` block we don't validate
// here, since we don't depend on their shape.
const MonthlyEntrySchema = z.object({
  month: z.number(),
  E_m: z.number(),
});

const PvcalcResponseSchema = z.object({
  outputs: z.object({
    monthly: z.object({
      fixed: z.array(MonthlyEntrySchema).length(12, "Expected exactly 12 monthly entries"),
    }),
    totals: z.object({
      fixed: z.object({
        E_y: z.number(),
        "H(i)_y": z.number(),
        l_total: z.number().optional(),
      }),
    }),
  }),
});

export interface SolarAssessment {
  /** Modelled annual PV generation for the assumed system, in kWh. */
  annualGenerationKwh: number;
  /** Modelled generation per calendar month (index 0 = January), in kWh. */
  monthlyGenerationKwh: number[];
  /**
   * Modelled annual in-plane solar irradiation at the assumed tilt/orientation,
   * in kWh/m². This is the "solar resource" figure — a raw physical quantity,
   * not a High/Medium/Low rating. Categorising it is SolarScore's job
   * (Phase 5, see CALCULATIONS.md), not this adapter's.
   */
  annualIrradiationKwhPerM2: number;
  /** System losses PVGIS applied, as a percentage of gross output, if reported. */
  systemLossPercent: number | null;
  assumptions: SolarAssumptions;
  confidence: "modelled-estimate";
  limitations: string[];
}

export interface PvgisInput {
  latitude: number;
  longitude: number;
  assumptions?: Partial<SolarAssumptions>;
}

const LIMITATIONS = [
  "Modelled from typical-year solar radiation data, not a physical site survey.",
  "Does not account for shading from nearby buildings, trees, or terrain.",
  "Assumes the roof characteristics above; actual roof pitch, orientation, or usable area may differ.",
  "Actual generation depends on installation quality, panel degradation over time, and local weather variation year to year.",
];

export class PvgisAdapter implements DataAdapter<PvgisInput, SolarAssessment> {
  readonly sourceName = SOURCE_NAME;

  async fetch(input: PvgisInput) {
    const assumptions: SolarAssumptions = {
      ...DEFAULT_SOLAR_ASSUMPTIONS,
      ...input.assumptions,
    };

    const json = shouldUseFixtures()
      ? successFixture
      : await this.callPvgis(input.latitude, input.longitude, assumptions);

    const parsed = PvcalcResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new AdapterError({
        kind: "unexpected_response_shape",
        source: SOURCE_NAME,
        message: "PVGIS response did not match the expected shape.",
        cause: parsed.error,
      });
    }

    const { outputs } = parsed.data;
    const monthlyGenerationKwh = outputs.monthly.fixed
      .slice()
      .sort((a, b) => a.month - b.month)
      .map((m) => m.E_m);

    return {
      annualGenerationKwh: outputs.totals.fixed.E_y,
      monthlyGenerationKwh,
      annualIrradiationKwhPerM2: outputs.totals.fixed["H(i)_y"],
      systemLossPercent: outputs.totals.fixed.l_total ?? null,
      assumptions,
      confidence: "modelled-estimate" as const,
      limitations: LIMITATIONS,
      _meta: {
        source: SOURCE_NAME,
        retrievedAt: new Date(),
        isFixture: shouldUseFixtures(),
      },
    };
  }

  private async callPvgis(
    latitude: number,
    longitude: number,
    assumptions: SolarAssumptions
  ): Promise<unknown> {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      peakpower: String(assumptions.peakPowerKw),
      loss: String(assumptions.lossPercent),
      angle: String(assumptions.tiltDeg),
      aspect: String(assumptions.azimuthDeg),
      mountingplace: assumptions.mountingType,
      raddatabase: assumptions.radiationDatabase,
      outputformat: "json",
    });

    const url = `${getEnv().PVGIS_BASE_URL}/v5_2/PVcalc?${params.toString()}`;

    // fetchJsonWithRetry already classifies a 400 (e.g. PVGIS's "location
    // outside coverage area" response) as `invalid_input`, distinct from a
    // genuine `temporarily_unavailable` outage — no extra translation needed
    // here.
    return fetchJsonWithRetry(url, SOURCE_NAME);
  }
}
