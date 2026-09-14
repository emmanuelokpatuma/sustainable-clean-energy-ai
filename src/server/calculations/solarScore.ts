/**
 * The deterministic SolarScore engine. See CALCULATIONS.md's SolarScore
 * section for the spec this implements. Like GreenScore, this is a pure
 * function of its inputs — no network, no database, no LLM call — so the AI
 * Advisor (Phase 7) can explain a `SolarScoreResult` without ever being the
 * thing that produced one.
 *
 * Unlike GreenScore, a SolarAssessment is not optional here: there is no
 * meaningful SolarScore without PVGIS data, so this engine takes it as a
 * required input rather than an excludable component. Financial opportunity
 * *is* optional within the result, per PRODUCT_SPEC.md: "only computed when
 * sufficient inputs exist... otherwise omitted rather than guessed."
 */

import { clamp, lerpScore, levelFor } from "./mathUtils";

export const SOLAR_SCORE_FORMULA_VERSION = "1.0.0";

// PRODUCT_SPEC.md, verbatim requirement: SolarScore language must never
// promise a specific saving. Included in every result's `limitations` so a
// caller can't accidentally drop it.
export const SOLAR_SCORE_DISCLAIMER =
  "Estimated and indicative only, based on the information provided. Actual results depend on installation, tariff, orientation, shading, consumption and other factors.";

// Typical UK PV yield per kWp of installed capacity for a reasonably
// well-oriented system is commonly cited in the region of 700 kWh/kWp/yr
// (poor orientation/shading) to 1,000 kWh/kWp/yr (good south-facing sites).
// These are approximate reference points for the suitability score, not a
// precise national dataset — verify against current PVGIS/industry figures
// before production use (same caveat as every other assumption in this
// project — see DATA_SOURCES.md).
const YIELD_PER_KWP_LOW = 700;
const YIELD_PER_KWP_HIGH = 1000;

// Approximate recent UK grid average annual carbon intensity. This has been
// falling for years as renewables/wind grow, so treat this as a rough,
// dated reference — verify against NESO's own published annual average
// before relying on it, and prefer a real figure from Phase 2's
// CarbonIntensityRecord data when the caller has one (see
// `averageGridIntensityGCo2PerKwh` below).
const DEFAULT_GRID_INTENSITY_G_CO2_PER_KWH = 150;

// Rough self-consumption assumptions for a UK home without vs with battery
// storage. A home without a battery typically uses only a minority of its
// solar generation directly (the rest is exported); a battery raises that
// substantially. These are approximations, not measured for this household —
// always overridable via `selfConsumptionRateOverride`.
const DEFAULT_SELF_CONSUMPTION_NO_BATTERY = 0.35;
const DEFAULT_SELF_CONSUMPTION_WITH_BATTERY = 0.65;

export interface SolarScoreInputs {
  /** The Phase 3 PVGIS output this score is built from — required. */
  solarAssessment: {
    annualGenerationKwh: number;
    monthlyGenerationKwh?: number[] | null;
    annualIrradiationKwhPerM2: number;
    assumptions: { peakPowerKw: number };
    limitations?: string[] | null;
  };
  /**
   * A real grid carbon-intensity figure, e.g. a recent average derived from
   * Phase 2's CarbonIntensityRecord data. If omitted, a labelled default
   * assumption is used instead — never silently treated as 0.
   */
  averageGridIntensityGCo2PerKwh?: number | null;
  /**
   * The household's actual electricity price. Financial opportunity is only
   * computed when this is provided — per PRODUCT_SPEC.md, a price is never
   * assumed on the caller's behalf, since guessing one risks promising a
   * saving that doesn't reflect the household's real tariff.
   */
  electricityPricePencePerKwh?: number | null;
  /** Overrides the default self-consumption assumption below, if known. */
  selfConsumptionRateOverride?: number | null;
  /** Used only to pick the default self-consumption assumption when no override is given. */
  hasBattery?: boolean | null;
}

export interface EmissionsReduction {
  annualKgCo2: number;
  gridIntensityGCo2PerKwh: number;
  /** True if `gridIntensityGCo2PerKwh` came from the default assumption, not a supplied figure. */
  isAssumedGridIntensity: boolean;
}

export type FinancialOpportunity =
  | {
      available: true;
      indicativeAnnualSavingGBP: number;
      selfConsumptionRateAssumed: number;
      electricityPricePencePerKwh: number;
    }
  | { available: false; reason: string };

export interface SolarScoreResult {
  formulaVersion: string;
  suitability: "High" | "Medium" | "Low";
  suitabilitySubScore: number; // 0–100, for internal consistency/testability
  annualGenerationKwh: number;
  generationPerKwp: number;
  monthlyGenerationKwh: number[] | null;
  solarResource: { annualIrradiationKwhPerM2: number };
  emissionsReduction: EmissionsReduction;
  financialOpportunity: FinancialOpportunity;
  confidence: "modelled-estimate";
  assumptions: string[];
  limitations: string[];
  dataSources: string[];
  calculatedAt: string;
}

export function calculateSolarScore(inputs: SolarScoreInputs): SolarScoreResult {
  const { solarAssessment } = inputs;
  const generationPerKwp =
    solarAssessment.annualGenerationKwh / solarAssessment.assumptions.peakPowerKw;

  // Below the "low" reference, keep differentiating down to a floor rather
  // than flatlining every poor site at the same score — mirrors the same
  // "add a floor segment" approach GreenScore's energy-efficiency component
  // uses at its bad end (see greenScore.ts), just mirrored to the other end
  // of the scale here.
  const suitabilitySubScore = Math.round(
    clamp(
      generationPerKwp >= YIELD_PER_KWP_LOW
        ? lerpScore(generationPerKwp, YIELD_PER_KWP_LOW, 40, YIELD_PER_KWP_HIGH, 100)
        : lerpScore(generationPerKwp, 0, 10, YIELD_PER_KWP_LOW, 40),
      0,
      100
    )
  );
  const suitability = levelFor(suitabilitySubScore);

  const isAssumedGridIntensity =
    inputs.averageGridIntensityGCo2PerKwh === null ||
    inputs.averageGridIntensityGCo2PerKwh === undefined;
  const gridIntensity = isAssumedGridIntensity
    ? DEFAULT_GRID_INTENSITY_G_CO2_PER_KWH
    : inputs.averageGridIntensityGCo2PerKwh!;

  // Whether self-consumed or exported, generated electricity displaces
  // electricity that would otherwise have come from the grid at this
  // intensity — so, unlike the financial calculation below, emissions
  // reduction does not depend on the self-consumption rate.
  const emissionsReduction: EmissionsReduction = {
    annualKgCo2: Math.round((solarAssessment.annualGenerationKwh * gridIntensity) / 1000),
    gridIntensityGCo2PerKwh: gridIntensity,
    isAssumedGridIntensity,
  };

  const financialOpportunity = computeFinancialOpportunity(inputs, solarAssessment.annualGenerationKwh);

  const assumptions: string[] = [
    SOLAR_SCORE_DISCLAIMER,
    `Solar suitability is based on modelled generation of ${Math.round(
      generationPerKwp
    )} kWh per kWp of installed capacity, compared against a typical UK range of roughly ${YIELD_PER_KWP_LOW}–${YIELD_PER_KWP_HIGH} kWh/kWp — an approximate reference, not a precise national dataset.`,
    isAssumedGridIntensity
      ? `Emissions reduction assumes a grid carbon intensity of ${DEFAULT_GRID_INTENSITY_G_CO2_PER_KWH} gCO2/kWh (an approximate recent UK average), since no location- or time-specific figure was provided.`
      : `Emissions reduction uses the supplied grid carbon intensity of ${gridIntensity} gCO2/kWh rather than a default assumption.`,
    "Emissions reduction assumes all generated electricity, whether self-consumed or exported, displaces electricity that would otherwise have come from the grid.",
  ];
  if (financialOpportunity.available) {
    assumptions.push(
      `Financial opportunity assumes ${Math.round(
        financialOpportunity.selfConsumptionRateAssumed * 100
      )}% of generated electricity is self-consumed at the supplied price; it excludes any export tariff (e.g. Smart Export Guarantee) income for the remainder.`
    );
  }

  const limitations = [...(solarAssessment.limitations ?? []), SOLAR_SCORE_DISCLAIMER];

  const dataSources = ["PVGIS (via Phase 3 SolarAssessment)"];
  if (!isAssumedGridIntensity) dataSources.push("Supplied grid carbon-intensity figure");
  if (financialOpportunity.available) dataSources.push("User-provided electricity price");

  return {
    formulaVersion: SOLAR_SCORE_FORMULA_VERSION,
    suitability,
    suitabilitySubScore,
    annualGenerationKwh: solarAssessment.annualGenerationKwh,
    generationPerKwp: Math.round(generationPerKwp),
    monthlyGenerationKwh: solarAssessment.monthlyGenerationKwh ?? null,
    solarResource: { annualIrradiationKwhPerM2: solarAssessment.annualIrradiationKwhPerM2 },
    emissionsReduction,
    financialOpportunity,
    confidence: "modelled-estimate",
    assumptions,
    limitations,
    dataSources,
    calculatedAt: new Date().toISOString(),
  };
}

function computeFinancialOpportunity(
  inputs: SolarScoreInputs,
  annualGenerationKwh: number
): FinancialOpportunity {
  const price = inputs.electricityPricePencePerKwh;
  if (price === null || price === undefined) {
    return {
      available: false,
      reason:
        "No electricity price was provided, so an indicative financial opportunity was not calculated rather than assuming one.",
    };
  }
  if (price <= 0) {
    return {
      available: false,
      reason: "The provided electricity price was not a positive number.",
    };
  }

  const selfConsumptionRate =
    inputs.selfConsumptionRateOverride ??
    (inputs.hasBattery === true
      ? DEFAULT_SELF_CONSUMPTION_WITH_BATTERY
      : DEFAULT_SELF_CONSUMPTION_NO_BATTERY);

  const indicativeAnnualSavingGBP =
    Math.round(annualGenerationKwh * selfConsumptionRate * price) / 100;

  return {
    available: true,
    indicativeAnnualSavingGBP,
    selfConsumptionRateAssumed: selfConsumptionRate,
    electricityPricePencePerKwh: price,
  };
}
