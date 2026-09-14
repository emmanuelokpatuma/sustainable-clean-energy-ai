import { describe, it, expect } from "vitest";
import {
  calculateSolarScore,
  SOLAR_SCORE_DISCLAIMER,
  SOLAR_SCORE_FORMULA_VERSION,
} from "@/server/calculations/solarScore";

const baseAssessment = {
  annualIrradiationKwhPerM2: 1080,
  assumptions: { peakPowerKw: 3.5 },
  limitations: ["Modelled from typical-year solar radiation data, not a physical site survey."],
};

describe("calculateSolarScore — suitability", () => {
  it("scores 100 (High) at or above the high yield-per-kWp reference", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 }, // 1000 kWh/kWp
    });
    expect(result.suitabilitySubScore).toBe(100);
    expect(result.suitability).toBe("High");
    expect(result.generationPerKwp).toBe(1000);
  });

  it("scores exactly 40 (Medium boundary) at the low yield-per-kWp reference", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 2450 }, // 700 kWh/kWp
    });
    expect(result.suitabilitySubScore).toBe(40);
    expect(result.suitability).toBe("Medium");
  });

  it("keeps differentiating below the low reference instead of flatlining at 40", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 1225 }, // 350 kWh/kWp
    });
    expect(result.suitabilitySubScore).toBe(25);
    expect(result.suitability).toBe("Low");
  });

  it("floors at 10, never claiming zero potential even for a very poor site", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 0.01 },
    });
    expect(result.suitabilitySubScore).toBeGreaterThanOrEqual(10);
    expect(result.suitability).toBe("Low");
  });

  it("caps at 100 rather than exceeding it for an exceptionally high yield", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 5250 }, // 1500 kWh/kWp
    });
    expect(result.suitabilitySubScore).toBe(100);
  });
});

describe("calculateSolarScore — emissions reduction", () => {
  it("uses the default assumed grid intensity when none is supplied", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
    });
    expect(result.emissionsReduction.isAssumedGridIntensity).toBe(true);
    expect(result.emissionsReduction.gridIntensityGCo2PerKwh).toBe(150);
    expect(result.emissionsReduction.annualKgCo2).toBe(525); // 3500 * 150 / 1000
  });

  it("uses a supplied grid intensity instead of the default", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
      averageGridIntensityGCo2PerKwh: 120,
    });
    expect(result.emissionsReduction.isAssumedGridIntensity).toBe(false);
    expect(result.emissionsReduction.gridIntensityGCo2PerKwh).toBe(120);
    expect(result.emissionsReduction.annualKgCo2).toBe(420); // 3500 * 120 / 1000
  });

  it("does not depend on self-consumption rate or battery status", () => {
    const withoutBattery = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
      hasBattery: false,
    });
    const withBattery = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
      hasBattery: true,
    });
    expect(withoutBattery.emissionsReduction.annualKgCo2).toBe(
      withBattery.emissionsReduction.annualKgCo2
    );
  });
});

describe("calculateSolarScore — financial opportunity", () => {
  it("is unavailable, with a reason, when no electricity price is provided", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
    });
    expect(result.financialOpportunity.available).toBe(false);
    if (!result.financialOpportunity.available) {
      expect(result.financialOpportunity.reason).toMatch(/no electricity price/i);
    }
  });

  it("is unavailable when the provided price is not positive", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
      electricityPricePencePerKwh: 0,
    });
    expect(result.financialOpportunity.available).toBe(false);
  });

  it("uses the no-battery default self-consumption rate (35%) when a price is given", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
      electricityPricePencePerKwh: 28,
    });
    expect(result.financialOpportunity.available).toBe(true);
    if (result.financialOpportunity.available) {
      expect(result.financialOpportunity.selfConsumptionRateAssumed).toBe(0.35);
      expect(result.financialOpportunity.indicativeAnnualSavingGBP).toBe(343); // 3500*0.35*28/100
    }
  });

  it("uses the with-battery default self-consumption rate (65%) when hasBattery is true", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
      electricityPricePencePerKwh: 28,
      hasBattery: true,
    });
    if (result.financialOpportunity.available) {
      expect(result.financialOpportunity.selfConsumptionRateAssumed).toBe(0.65);
      expect(result.financialOpportunity.indicativeAnnualSavingGBP).toBe(637); // 3500*0.65*28/100
    }
  });

  it("prefers an explicit self-consumption override over the battery-based default", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
      electricityPricePencePerKwh: 28,
      hasBattery: true,
      selfConsumptionRateOverride: 0.5,
    });
    if (result.financialOpportunity.available) {
      expect(result.financialOpportunity.selfConsumptionRateAssumed).toBe(0.5);
      expect(result.financialOpportunity.indicativeAnnualSavingGBP).toBe(490); // 3500*0.5*28/100
    }
  });
});

describe("calculateSolarScore — disclaimers, assumptions, data sources", () => {
  it("always includes the mandated disclaimer in both assumptions and limitations", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
    });
    expect(result.assumptions).toContain(SOLAR_SCORE_DISCLAIMER);
    expect(result.limitations).toContain(SOLAR_SCORE_DISCLAIMER);
  });

  it("carries over the underlying SolarAssessment's limitations", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
    });
    expect(result.limitations).toContain(
      "Modelled from typical-year solar radiation data, not a physical site survey."
    );
  });

  it("passes through monthlyGenerationKwh when provided, and null when not", () => {
    const withMonthly = calculateSolarScore({
      solarAssessment: {
        ...baseAssessment,
        annualGenerationKwh: 3500,
        monthlyGenerationKwh: Array(12).fill(292),
      },
    });
    expect(withMonthly.monthlyGenerationKwh).toHaveLength(12);

    const withoutMonthly = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
    });
    expect(withoutMonthly.monthlyGenerationKwh).toBeNull();
  });

  it("lists only the data sources actually used", () => {
    const minimal = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
    });
    expect(minimal.dataSources).toEqual(["PVGIS (via Phase 3 SolarAssessment)"]);

    const full = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
      averageGridIntensityGCo2PerKwh: 120,
      electricityPricePencePerKwh: 28,
    });
    expect(full.dataSources).toEqual([
      "PVGIS (via Phase 3 SolarAssessment)",
      "Supplied grid carbon-intensity figure",
      "User-provided electricity price",
    ]);
  });

  it("stamps the current formula version", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
    });
    expect(result.formulaVersion).toBe(SOLAR_SCORE_FORMULA_VERSION);
  });

  it("produces an ISO-formatted calculatedAt timestamp", () => {
    const result = calculateSolarScore({
      solarAssessment: { ...baseAssessment, annualGenerationKwh: 3500 },
    });
    expect(() => new Date(result.calculatedAt).toISOString()).not.toThrow();
  });
});
