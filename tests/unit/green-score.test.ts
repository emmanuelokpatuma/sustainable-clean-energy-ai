import { describe, it, expect } from "vitest";
import { calculateGreenScore, GREEN_SCORE_FORMULA_VERSION } from "@/server/calculations/greenScore";

describe("calculateGreenScore — insufficient data", () => {
  it("returns ok:false when every input is missing, rather than inventing a score", () => {
    const outcome = calculateGreenScore({});
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("insufficient_data");
      expect(outcome.message).toBeTruthy();
    }
  });

  it("returns ok:false when actionProgress.total is 0 and nothing else is provided", () => {
    const outcome = calculateGreenScore({ actionProgress: { completed: 0, total: 0 } });
    expect(outcome.ok).toBe(false);
  });
});

describe("calculateGreenScore — energy efficiency component", () => {
  it("scores 100 at or below the low usage band", () => {
    const outcome = calculateGreenScore({
      energyProfile: { annualUsageKwh: 1800, hasGasHeating: true },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "energyEfficiency")!;
      expect(c.score).toBe(100);
      expect(c.level).toBe("High");
    }
  });

  it("scores exactly 70 at the medium usage band boundary", () => {
    const outcome = calculateGreenScore({
      energyProfile: { annualUsageKwh: 2700, hasGasHeating: true },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "energyEfficiency")!;
      expect(c.score).toBe(70);
    }
  });

  it("never drops below a floor of 10 for very high usage", () => {
    const outcome = calculateGreenScore({
      energyProfile: { annualUsageKwh: 50000, hasGasHeating: true },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "energyEfficiency")!;
      expect(c.score).toBeGreaterThanOrEqual(10);
      expect(c.score).toBeLessThan(40);
    }
  });

  it("uses the higher all-electric benchmark when hasGasHeating is false", () => {
    // 4000 kWh would score poorly on the electricity-only bands but well on
    // the all-electric bands — this only passes if the correct bands are used.
    const outcome = calculateGreenScore({
      energyProfile: { annualUsageKwh: 4000, hasGasHeating: false },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "energyEfficiency")!;
      expect(c.score).toBeGreaterThan(70);
    }
  });

  it("is excluded, not defaulted, when annualUsageKwh is not provided", () => {
    const outcome = calculateGreenScore({
      energyProfile: { hasGasHeating: true },
      solarAssessment: { annualIrradiationKwhPerM2: 1000 }, // keep result non-insufficient
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "energyEfficiency")!;
      expect(c.included).toBe(false);
      expect(c.score).toBeNull();
      expect(c.effectiveWeight).toBe(0);
    }
  });
});

describe("calculateGreenScore — renewable/solar opportunity component", () => {
  it("scores 40 at or below the low irradiation reference", () => {
    const outcome = calculateGreenScore({ solarAssessment: { annualIrradiationKwhPerM2: 800 } });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "renewableOpportunity")!;
      expect(c.score).toBe(40);
    }
  });

  it("scores 100 at or above the high irradiation reference", () => {
    const outcome = calculateGreenScore({ solarAssessment: { annualIrradiationKwhPerM2: 1300 } });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "renewableOpportunity")!;
      expect(c.score).toBe(100);
    }
  });

  it("is excluded when no solar assessment is provided", () => {
    const outcome = calculateGreenScore({
      energyProfile: { annualUsageKwh: 2000, hasGasHeating: true },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "renewableOpportunity")!;
      expect(c.included).toBe(false);
    }
  });
});

describe("calculateGreenScore — carbon optimisation component", () => {
  it.each([
    ["very low", 100],
    ["low", 80],
    ["moderate", 55],
    ["high", 30],
    ["very high", 10],
  ] as const)("maps index '%s' to score %i with no forecast data", (index, expectedScore) => {
    const outcome = calculateGreenScore({ carbonIntensity: { currentIndex: index } });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "carbonOptimisation")!;
      expect(c.score).toBe(expectedScore);
    }
  });

  it("adds a variability boost when the forecast spread is wide", () => {
    const outcome = calculateGreenScore({
      carbonIntensity: { currentIndex: "moderate", forecastValues: [40, 210] },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "carbonOptimisation")!;
      expect(c.score).toBe(65); // 55 + 10
    }
  });

  it("does not add a boost when the forecast spread is narrow", () => {
    const outcome = calculateGreenScore({
      carbonIntensity: { currentIndex: "moderate", forecastValues: [50, 60] },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "carbonOptimisation")!;
      expect(c.score).toBe(55);
    }
  });

  it("ignores null forecast values rather than treating them as zero", () => {
    const outcome = calculateGreenScore({
      carbonIntensity: { currentIndex: "moderate", forecastValues: [null, null, 60] },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "carbonOptimisation")!;
      expect(c.score).toBe(55); // fewer than 2 real values -> no variability boost
    }
  });
});

describe("calculateGreenScore — cleantech opportunity component", () => {
  it("is excluded when none of the three signals are known", () => {
    const outcome = calculateGreenScore({
      energyProfile: { annualUsageKwh: 2000 },
      solarAssessment: { annualIrradiationKwhPerM2: 1000 },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "cleantechOpportunity")!;
      expect(c.included).toBe(false);
    }
  });

  it("scores 100 when all three known signals are achieved", () => {
    const outcome = calculateGreenScore({
      energyProfile: { hasEvCharger: true, hasBattery: true, hasGasHeating: false },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "cleantechOpportunity")!;
      expect(c.score).toBe(100);
    }
  });

  it("scores 0 when all three known signals are not achieved", () => {
    const outcome = calculateGreenScore({
      energyProfile: { hasEvCharger: false, hasBattery: false, hasGasHeating: true },
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "cleantechOpportunity")!;
      expect(c.score).toBe(0);
    }
  });

  it("averages only over the signals that are actually known", () => {
    const outcome = calculateGreenScore({
      energyProfile: { hasEvCharger: true }, // battery, heating unknown
    });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "cleantechOpportunity")!;
      expect(c.score).toBe(100); // 1 of 1 known signals achieved
    }
  });
});

describe("calculateGreenScore — user action/progress component", () => {
  it("is excluded when actionProgress is not provided", () => {
    const outcome = calculateGreenScore({ energyProfile: { annualUsageKwh: 2000 } });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "userProgress")!;
      expect(c.included).toBe(false);
    }
  });

  it("scores completed/total as a percentage", () => {
    const outcome = calculateGreenScore({ actionProgress: { completed: 3, total: 4 } });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "userProgress")!;
      expect(c.score).toBe(75);
    }
  });

  it("clamps at 100 even if completed exceeds total", () => {
    const outcome = calculateGreenScore({ actionProgress: { completed: 12, total: 10 } });
    if (outcome.ok) {
      const c = outcome.result.componentScores.find((c) => c.key === "userProgress")!;
      expect(c.score).toBe(100);
    }
  });
});

describe("calculateGreenScore — weighting, renormalisation and totals", () => {
  it("computes a weighted total across all five components when all are included", () => {
    const outcome = calculateGreenScore({
      energyProfile: {
        annualUsageKwh: 1800, // efficiency: 100
        hasGasHeating: true,
        hasEvCharger: true, // cleantech: 2/3 achieved
        hasBattery: true,
      },
      solarAssessment: { annualIrradiationKwhPerM2: 1200 }, // renewable: 100
      carbonIntensity: { currentIndex: "very low" }, // carbon: 100
      actionProgress: { completed: 5, total: 10 }, // progress: 50
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const { result } = outcome;
      expect(result.componentScores.every((c) => c.included)).toBe(true);
      // 100*.25 + 100*.25 + 100*.20 + 67*.15 + 50*.15 = 87.55 -> 88
      expect(result.totalScore).toBe(88);
      expect(result.formulaVersion).toBe(GREEN_SCORE_FORMULA_VERSION);
      // effective weights should sum to 1 when nothing is excluded
      const weightSum = result.componentScores.reduce((s, c) => s + c.effectiveWeight, 0);
      expect(weightSum).toBeCloseTo(1, 5);
    }
  });

  it("renormalises weights to sum to 1 when some components are excluded", () => {
    const outcome = calculateGreenScore({
      energyProfile: { annualUsageKwh: 2700, hasGasHeating: true }, // efficiency: 70
    });
    if (outcome.ok) {
      const { result } = outcome;
      const included = result.componentScores.filter((c) => c.included);
      expect(included).toHaveLength(1);
      expect(included[0]!.effectiveWeight).toBeCloseTo(1, 5);
      // With only one component included at its own score, total == that score.
      expect(result.totalScore).toBe(70);
      expect(result.assumptions.some((a) => a.includes("4 of 5 components"))).toBe(true);
    }
  });

  it("never lets an excluded component's null score silently count as zero", () => {
    // If exclusion were mishandled as "score 0", a single perfect component
    // would be dragged down by the other four instead of standing on its own.
    const outcome = calculateGreenScore({
      carbonIntensity: { currentIndex: "very low" }, // carbon: 100, weight 0.20
    });
    if (outcome.ok) {
      expect(outcome.result.totalScore).toBe(100);
    }
  });

  it("puts high-scoring components in strengths and low-scoring ones in opportunities", () => {
    const outcome = calculateGreenScore({
      solarAssessment: { annualIrradiationKwhPerM2: 1200 }, // 100 -> strength
      carbonIntensity: { currentIndex: "very high" }, // 10 -> opportunity
    });
    if (outcome.ok) {
      expect(outcome.result.strengths.some((s) => s.startsWith("Renewable"))).toBe(true);
      expect(
        outcome.result.opportunities.some((o) => o.startsWith("Electricity-carbon"))
      ).toBe(true);
    }
  });

  it("always includes the non-official-rating disclaimer in assumptions", () => {
    const outcome = calculateGreenScore({ carbonIntensity: { currentIndex: "moderate" } });
    if (outcome.ok) {
      expect(
        outcome.result.assumptions.some((a) => a.includes("not an official government rating"))
      ).toBe(true);
    }
  });

  it("lists only the data sources actually used", () => {
    const outcome = calculateGreenScore({
      solarAssessment: { annualIrradiationKwhPerM2: 1000 },
    });
    if (outcome.ok) {
      expect(outcome.result.dataSources).toEqual(["PVGIS (via Phase 3 SolarAssessment)"]);
    }
  });

  it("produces an ISO-formatted calculatedAt timestamp", () => {
    const outcome = calculateGreenScore({ carbonIntensity: { currentIndex: "low" } });
    if (outcome.ok) {
      expect(() => new Date(outcome.result.calculatedAt).toISOString()).not.toThrow();
    }
  });
});
