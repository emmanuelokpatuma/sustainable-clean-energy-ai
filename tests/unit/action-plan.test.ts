import { describe, it, expect } from "vitest";
import { generateActionPlan } from "@/server/calculations/actionPlan";
import type { GreenScoreResult } from "@/server/calculations/greenScore";
import type { SolarScoreResult } from "@/server/calculations/solarScore";
import type { EnergyNowInterpretation } from "@/server/calculations/energyNowInterpretation";

const HIGH_SOLAR: SolarScoreResult = {
  formulaVersion: "1.0.0",
  suitability: "High",
  suitabilitySubScore: 89,
  annualGenerationKwh: 3500,
  generationPerKwp: 1000,
  monthlyGenerationKwh: null,
  solarResource: { annualIrradiationKwhPerM2: 1200 },
  emissionsReduction: { annualKgCo2: 525, gridIntensityGCo2PerKwh: 150, isAssumedGridIntensity: true },
  financialOpportunity: {
    available: true,
    indicativeAnnualSavingGBP: 343,
    selfConsumptionRateAssumed: 0.35,
    electricityPricePencePerKwh: 28,
  },
  confidence: "modelled-estimate",
  assumptions: ["Estimated and indicative only, based on the information provided."],
  limitations: ["Modelled from typical-year solar radiation data, not a physical site survey."],
  dataSources: ["PVGIS (via Phase 3 SolarAssessment)"],
  calculatedAt: "2026-09-14T11:00:00.000Z",
};

const LOW_SOLAR: SolarScoreResult = {
  ...HIGH_SOLAR,
  suitability: "Low",
  suitabilitySubScore: 25,
  financialOpportunity: { available: false, reason: "No electricity price was provided." },
};

const ENERGY_NOW_WITH_SUGGESTION: { interpretation: EnergyNowInterpretation } = {
  interpretation: {
    currentSummary: "Electricity is currently at a moderate carbon intensity.",
    currentIndex: "moderate",
    flexibleUseSuggestion: {
      available: true,
      from: "2026-09-14T15:00Z",
      to: "2026-09-14T15:30Z",
      timingLabel: "later today (afternoon)",
      forecastGCo2PerKwh: 98,
      index: "low",
      message: "Later today (afternoon) may be a better time for flexible electricity use.",
    },
    essentialServicesCaveat: "Flexible use only, never heating.",
    forecastDisclaimer: "Forecast, not a certainty.",
  },
};

const ENERGY_NOW_NO_SUGGESTION: { interpretation: EnergyNowInterpretation } = {
  interpretation: {
    ...ENERGY_NOW_WITH_SUGGESTION.interpretation,
    flexibleUseSuggestion: { available: false, reason: "No significantly cleaner window." },
  },
};

function makeGreenScore(overrides: {
  efficiencyScore?: number | null;
  efficiencyIncluded?: boolean;
  excludeCleantech?: boolean;
}): GreenScoreResult {
  const efficiencyIncluded = overrides.efficiencyIncluded ?? true;
  const efficiencyScore = overrides.efficiencyScore ?? 90;
  return {
    totalScore: 74,
    formulaVersion: "1.0.0",
    componentScores: [
      {
        key: "energyEfficiency",
        label: "Energy efficiency",
        included: efficiencyIncluded,
        score: efficiencyIncluded ? efficiencyScore : null,
        baseWeight: 0.25,
        effectiveWeight: efficiencyIncluded ? 0.25 : 0,
        level: efficiencyIncluded ? (efficiencyScore! >= 70 ? "High" : "Low") : null,
        explanation: "Annual usage of 2,700 kWh compared against typical UK household bands.",
      },
      {
        key: "renewableOpportunity",
        label: "Renewable / solar opportunity",
        included: true,
        score: 89,
        baseWeight: 0.25,
        effectiveWeight: 0.25,
        level: "High",
        explanation: "solar explanation",
      },
      {
        key: "carbonOptimisation",
        label: "Electricity-carbon optimisation opportunity",
        included: true,
        score: 55,
        baseWeight: 0.2,
        effectiveWeight: 0.2,
        level: "Medium",
        explanation: "carbon explanation",
      },
      {
        key: "cleantechOpportunity",
        label: "CleanTech opportunity",
        included: !overrides.excludeCleantech,
        score: overrides.excludeCleantech ? null : 50,
        baseWeight: 0.15,
        effectiveWeight: overrides.excludeCleantech ? 0 : 0.15,
        level: overrides.excludeCleantech ? null : "Medium",
        explanation: "cleantech explanation",
      },
      {
        key: "userProgress",
        label: "User action / progress",
        included: false,
        score: null,
        baseWeight: 0.15,
        effectiveWeight: 0,
        level: null,
        explanation: "no progress data",
      },
    ],
    strengths: [],
    opportunities: [],
    assumptions: [
      "Energy efficiency uses commonly published UK typical-consumption bands as a benchmark, not a measurement specific to this property.",
      "GreenScore is our own transparency-focused score, not an official government rating.",
    ],
    dataSources: ["User-provided energy profile"],
    calculatedAt: "2026-09-14T11:00:00.000Z",
  };
}

describe("generateActionPlan — empty input", () => {
  it("returns no actions and an explanatory note when nothing is provided", () => {
    const result = generateActionPlan({});
    expect(result.actions).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("No recommendations could be generated"))).toBe(true);
  });
});

describe("generateActionPlan — solar rule", () => {
  it("recommends investigating solar when suitability is not Low", () => {
    const result = generateActionPlan({ solarScore: HIGH_SOLAR });
    const solarAction = result.actions.find((a) => a.id === "investigate-solar");
    expect(solarAction).toBeDefined();
    expect(solarAction!.title).toBe("Investigate solar suitability");
    expect(solarAction!.estimatedImpact.annualKgCo2).toBe(525);
    expect(solarAction!.estimatedImpact.annualGBP).toBe(343);
  });

  it("still generates an entry (with a different framing) when suitability is Low", () => {
    const result = generateActionPlan({ solarScore: LOW_SOLAR });
    const solarAction = result.actions.find((a) => a.id === "investigate-solar");
    expect(solarAction).toBeDefined();
    expect(solarAction!.title).toContain("isn't a strong fit");
    expect(solarAction!.estimatedImpact.annualGBP).toBeNull();
  });

  it("never invents a financial figure when SolarScore's own financialOpportunity is unavailable", () => {
    const result = generateActionPlan({ solarScore: LOW_SOLAR });
    const solarAction = result.actions.find((a) => a.id === "investigate-solar")!;
    expect(solarAction.estimatedImpact.annualGBP).toBeNull();
    expect(solarAction.estimatedImpact.note).toMatch(/not calculated rather than guessed/i);
  });
});

describe("generateActionPlan — flexible-use rule", () => {
  it("recommends shifting flexible use when a suggestion is available", () => {
    const result = generateActionPlan({ energyNow: ENERGY_NOW_WITH_SUGGESTION });
    const action = result.actions.find((a) => a.id === "shift-flexible-use");
    expect(action).toBeDefined();
    expect(action!.estimatedImpact.annualKgCo2).toBeNull();
    expect(action!.estimatedImpact.note).toMatch(/no specific figure is calculated/i);
  });

  it("generates nothing when no flexible-use suggestion is available", () => {
    const result = generateActionPlan({ energyNow: ENERGY_NOW_NO_SUGGESTION });
    expect(result.actions.find((a) => a.id === "shift-flexible-use")).toBeUndefined();
  });
});

describe("generateActionPlan — efficiency review rule", () => {
  it("recommends reviewing efficiency when the component score is below 70", () => {
    const result = generateActionPlan({ greenScore: makeGreenScore({ efficiencyScore: 50 }) });
    expect(result.actions.find((a) => a.id === "review-energy-efficiency")).toBeDefined();
  });

  it("does not recommend it when the component score is already high", () => {
    const result = generateActionPlan({ greenScore: makeGreenScore({ efficiencyScore: 90 }) });
    expect(result.actions.find((a) => a.id === "review-energy-efficiency")).toBeUndefined();
  });

  it("does not recommend it when the component was excluded (no data, not a low score)", () => {
    const result = generateActionPlan({ greenScore: makeGreenScore({ efficiencyIncluded: false }) });
    expect(result.actions.find((a) => a.id === "review-energy-efficiency")).toBeUndefined();
  });
});

describe("generateActionPlan — data completion rule", () => {
  it("recommends completing the profile when a component is excluded", () => {
    const result = generateActionPlan({ greenScore: makeGreenScore({ excludeCleantech: true }) });
    const action = result.actions.find((a) => a.id === "complete-your-profile");
    expect(action).toBeDefined();
    expect(action!.explanation).toContain("CleanTech opportunity");
  });

  it("fires even when only userProgress is excluded (not gated on cleantech specifically)", () => {
    // userProgress is always excluded in makeGreenScore's fixture (Action
    // Plans/Phase 8 have no persistence to track progress against yet), so
    // this rule should still fire on that alone.
    const result = generateActionPlan({ greenScore: makeGreenScore({}) });
    expect(result.actions.find((a) => a.id === "complete-your-profile")).toBeDefined();
  });
});

describe("generateActionPlan — priority ordering", () => {
  it("orders carbon-category actions above cost-category actions at equal difficulty/confidence", () => {
    const result = generateActionPlan({
      greenScore: makeGreenScore({ efficiencyScore: 50 }), // cost, medium difficulty, medium confidence
      energyNow: ENERGY_NOW_WITH_SUGGESTION, // carbon, low difficulty, medium confidence
    });
    const carbonAction = result.actions.find((a) => a.id === "shift-flexible-use")!;
    const costAction = result.actions.find((a) => a.id === "review-energy-efficiency")!;
    expect(carbonAction.priority).toBeLessThan(costAction.priority);
  });

  it("orders lower-difficulty actions above higher-difficulty ones within the same category", () => {
    // Both solar (carbon, high difficulty) and flexible-use (carbon, low difficulty) are "carbon" —
    // flexible-use should rank higher due to lower difficulty.
    const result = generateActionPlan({ solarScore: HIGH_SOLAR, energyNow: ENERGY_NOW_WITH_SUGGESTION });
    const solarAction = result.actions.find((a) => a.id === "investigate-solar")!;
    const flexAction = result.actions.find((a) => a.id === "shift-flexible-use")!;
    expect(flexAction.priority).toBeLessThan(solarAction.priority);
  });

  it("always places the informational data-completion action last", () => {
    const result = generateActionPlan({
      solarScore: HIGH_SOLAR,
      energyNow: ENERGY_NOW_WITH_SUGGESTION,
      greenScore: makeGreenScore({ efficiencyScore: 50, excludeCleantech: true }),
    });
    const dataAction = result.actions.find((a) => a.id === "complete-your-profile")!;
    expect(dataAction.priority).toBe(result.actions.length);
  });

  it("assigns sequential priorities starting at 1 with no gaps", () => {
    const result = generateActionPlan({
      solarScore: HIGH_SOLAR,
      energyNow: ENERGY_NOW_WITH_SUGGESTION,
      greenScore: makeGreenScore({ efficiencyScore: 50 }),
    });
    const priorities = result.actions.map((a) => a.priority).sort((a, b) => a - b);
    expect(priorities).toEqual(Array.from({ length: result.actions.length }, (_, i) => i + 1));
  });
});

describe("generateActionPlan — general invariants", () => {
  it("every action includes a non-empty suggestedNextStep and estimatedImpact.note", () => {
    const result = generateActionPlan({
      solarScore: HIGH_SOLAR,
      energyNow: ENERGY_NOW_WITH_SUGGESTION,
      greenScore: makeGreenScore({ efficiencyScore: 50, excludeCleantech: true }),
    });
    for (const action of result.actions) {
      expect(action.suggestedNextStep.length).toBeGreaterThan(0);
      expect(action.estimatedImpact.note.length).toBeGreaterThan(0);
    }
  });

  it("includes the provenance note stating recommendations come from structured logic, not the AI", () => {
    const result = generateActionPlan({ solarScore: HIGH_SOLAR });
    expect(result.notes.some((n) => n.includes("never invented or altered by the AI Advisor"))).toBe(true);
  });
});
