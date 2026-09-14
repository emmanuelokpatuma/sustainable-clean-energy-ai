import { describe, it, expect } from "vitest";
import { renderGroundingContext } from "@/server/advisor/groundingContext";
import type { GreenScoreResult } from "@/server/calculations/greenScore";
import type { SolarScoreResult } from "@/server/calculations/solarScore";

const sampleGreenScore: GreenScoreResult = {
  totalScore: 74,
  formulaVersion: "1.0.0",
  componentScores: [
    {
      key: "energyEfficiency",
      label: "Energy efficiency",
      included: true,
      score: 70,
      baseWeight: 0.25,
      effectiveWeight: 0.25,
      level: "High",
      explanation: "Annual usage of 2,700 kWh compared against typical UK household bands.",
    },
    {
      key: "renewableOpportunity",
      label: "Renewable / solar opportunity",
      included: false,
      score: null,
      baseWeight: 0.25,
      effectiveWeight: 0,
      level: null,
      explanation: "No solar assessment was provided, so solar opportunity could not be assessed.",
    },
  ],
  strengths: ["Energy efficiency: strong usage."],
  opportunities: [],
  assumptions: ["GreenScore is our own transparency-focused score, not an official government rating."],
  dataSources: ["User-provided energy profile"],
  calculatedAt: "2026-09-14T11:00:00.000Z",
};

const sampleSolarScore: SolarScoreResult = {
  formulaVersion: "1.0.0",
  suitability: "High",
  suitabilitySubScore: 89,
  annualGenerationKwh: 3500,
  generationPerKwp: 1000,
  monthlyGenerationKwh: null,
  solarResource: { annualIrradiationKwhPerM2: 1200 },
  emissionsReduction: { annualKgCo2: 525, gridIntensityGCo2PerKwh: 150, isAssumedGridIntensity: true },
  financialOpportunity: { available: false, reason: "No electricity price was provided." },
  confidence: "modelled-estimate",
  assumptions: ["Estimated and indicative only, based on the information provided."],
  limitations: ["Modelled from typical-year solar radiation data, not a physical site survey."],
  dataSources: ["PVGIS (via Phase 3 SolarAssessment)"],
  calculatedAt: "2026-09-14T11:00:00.000Z",
};

describe("renderGroundingContext — absent data", () => {
  it("states plainly that everything is unavailable when given nothing", () => {
    const text = renderGroundingContext({});
    expect(text).toContain("LOCATION: not available.");
    expect(text).toContain("GREEN_SCORE: not available");
    expect(text).toContain("SOLAR_SCORE: not available");
    expect(text).toContain("ENERGY_NOW: not available.");
    expect(text).toContain("RECOMMENDATIONS: not available yet");
  });

  it("never mentions a number when GreenScore is absent", () => {
    const text = renderGroundingContext({});
    // Guards against a future edit accidentally interpolating a stray
    // default score — the "not available" case must contain no digits at
    // all in the GreenScore line.
    const greenScoreLine = text.split("\n").find((l) => l.startsWith("GREEN_SCORE"))!;
    expect(/\d/.test(greenScoreLine)).toBe(false);
  });
});

describe("renderGroundingContext — GreenScore section", () => {
  it("includes the total score and explicitly labels it as not an official rating", () => {
    const text = renderGroundingContext({ greenScore: sampleGreenScore });
    expect(text).toContain("Total score: 74/100");
    expect(text).toContain("not an official government rating");
  });

  it("marks an excluded component as not assessed, without a score", () => {
    const text = renderGroundingContext({ greenScore: sampleGreenScore });
    expect(text).toContain("Renewable / solar opportunity: not assessed (no data provided)");
  });

  it("includes an included component's actual score", () => {
    const text = renderGroundingContext({ greenScore: sampleGreenScore });
    expect(text).toContain("Energy efficiency: 70/100 (High)");
  });

  it("includes assumptions and data sources verbatim", () => {
    const text = renderGroundingContext({ greenScore: sampleGreenScore });
    expect(text).toContain("not an official government rating");
    expect(text).toContain("User-provided energy profile");
  });
});

describe("renderGroundingContext — SolarScore section", () => {
  it("includes generation, suitability, and emissions figures", () => {
    const text = renderGroundingContext({ solarScore: sampleSolarScore });
    expect(text).toContain("Suitability: High");
    expect(text).toContain("3500 kWh");
    expect(text).toContain("525 kg CO2/year");
  });

  it("explicitly instructs against inventing a financial figure when unavailable", () => {
    const text = renderGroundingContext({ solarScore: sampleSolarScore });
    expect(text).toContain("Financial opportunity: not available");
    expect(text).toContain("Do not state or estimate a specific saving figure");
  });

  it("includes a financial figure with its assumptions when available", () => {
    const withFinance: SolarScoreResult = {
      ...sampleSolarScore,
      financialOpportunity: {
        available: true,
        indicativeAnnualSavingGBP: 343,
        selfConsumptionRateAssumed: 0.35,
        electricityPricePencePerKwh: 28,
      },
    };
    const text = renderGroundingContext({ solarScore: withFinance });
    expect(text).toContain("£343/year");
    expect(text).toContain("35% self-consumption");
    expect(text).toContain("not a guarantee");
  });

  it("carries over the underlying limitations", () => {
    const text = renderGroundingContext({ solarScore: sampleSolarScore });
    expect(text).toContain("not a physical site survey");
  });
});

describe("renderGroundingContext — EnergyNow section", () => {
  it("includes the current index and interpretation", () => {
    const text = renderGroundingContext({
      energyNow: {
        current: { index: "moderate", actual: 148, from: "2026-09-14T11:00Z", to: "2026-09-14T11:30Z" },
        interpretation: {
          currentSummary: "Electricity is currently at a moderate carbon intensity.",
          currentIndex: "moderate",
          flexibleUseSuggestion: { available: false, reason: "No significantly cleaner window." },
          essentialServicesCaveat: "Flexible use only, never heating.",
          forecastDisclaimer: "Forecast, not a certainty.",
        },
        retrievedAt: "2026-09-14T11:05:00.000Z",
        isFixture: false,
      },
    });
    expect(text).toContain("moderate carbon intensity");
    expect(text).toContain("148 gCO2/kWh");
    expect(text).toContain("Flexible use only, never heating.");
  });

  it("labels a flexible-use suggestion as a forecast, not a certainty", () => {
    const text = renderGroundingContext({
      energyNow: {
        current: { index: "high", actual: 200, from: "x", to: "y" },
        interpretation: {
          currentSummary: "Electricity is currently relatively high-carbon.",
          currentIndex: "high",
          flexibleUseSuggestion: {
            available: true,
            from: "x",
            to: "y",
            timingLabel: "later today (evening)",
            forecastGCo2PerKwh: 90,
            index: "low",
            message: "Later today (evening) may be a better time for flexible electricity use.",
          },
          essentialServicesCaveat: "caveat",
          forecastDisclaimer: "disclaimer",
        },
        retrievedAt: "2026-09-14T11:05:00.000Z",
        isFixture: true,
      },
    });
    expect(text).toContain("FORECAST, not a certainty");
    expect(text).toContain("(demo/fixture data)");
  });
});

describe("renderGroundingContext — Recommendations section", () => {
  it("lists provided recommendations in priority order", () => {
    const text = renderGroundingContext({
      recommendations: [
        { title: "Investigate solar", explanation: "High suitability at this location.", priority: 1 },
      ],
    });
    expect(text).toContain("[Priority 1] Investigate solar");
  });
});
