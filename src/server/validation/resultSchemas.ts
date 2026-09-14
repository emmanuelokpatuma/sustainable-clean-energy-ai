import { z } from "zod";

/**
 * Validates the shape of results ALREADY computed by other routes
 * (GreenScoreResult, SolarScoreResult, an EnergyNow context) when they're
 * passed back in as input — e.g. `/api/advisor/ask` and
 * `/api/action-plan/generate` both take these as request body fields rather
 * than recomputing them, since there's no persistence yet (Phase 9) to look
 * them up server-side.
 *
 * Extracted here after the second route needed the identical ~80 lines of
 * schema — a third copy-paste would have been the signal to do this
 * refactor sooner. Pure extraction: no validation behaviour changed for the
 * route that already used this (see PROGRESS.md's Phase 8 entry).
 */

export const componentScoreSchema = z.object({
  key: z.string(),
  label: z.string(),
  included: z.boolean(),
  score: z.number().nullable(),
  baseWeight: z.number(),
  effectiveWeight: z.number(),
  level: z.enum(["High", "Medium", "Low"]).nullable(),
  explanation: z.string(),
});

export const greenScoreResultSchema = z.object({
  totalScore: z.number(),
  formulaVersion: z.string(),
  componentScores: z.array(componentScoreSchema),
  strengths: z.array(z.string()),
  opportunities: z.array(z.string()),
  assumptions: z.array(z.string()),
  dataSources: z.array(z.string()),
  calculatedAt: z.string(),
});

export const solarScoreResultSchema = z.object({
  formulaVersion: z.string(),
  suitability: z.enum(["High", "Medium", "Low"]),
  suitabilitySubScore: z.number(),
  annualGenerationKwh: z.number(),
  generationPerKwp: z.number(),
  monthlyGenerationKwh: z.array(z.number()).nullable(),
  solarResource: z.object({ annualIrradiationKwhPerM2: z.number() }),
  emissionsReduction: z.object({
    annualKgCo2: z.number(),
    gridIntensityGCo2PerKwh: z.number(),
    isAssumedGridIntensity: z.boolean(),
  }),
  financialOpportunity: z.union([
    z.object({
      available: z.literal(true),
      indicativeAnnualSavingGBP: z.number(),
      selfConsumptionRateAssumed: z.number(),
      electricityPricePencePerKwh: z.number(),
    }),
    z.object({ available: z.literal(false), reason: z.string() }),
  ]),
  confidence: z.string(),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  dataSources: z.array(z.string()),
  calculatedAt: z.string(),
});

export const energyNowContextSchema = z.object({
  current: z.object({
    index: z.string(),
    actual: z.number().nullable(),
    from: z.string(),
    to: z.string(),
  }),
  interpretation: z.object({
    currentSummary: z.string(),
    currentIndex: z.string(),
    flexibleUseSuggestion: z.union([
      z.object({
        available: z.literal(true),
        from: z.string(),
        to: z.string(),
        timingLabel: z.string(),
        forecastGCo2PerKwh: z.number(),
        index: z.string(),
        message: z.string(),
      }),
      z.object({ available: z.literal(false), reason: z.string() }),
    ]),
    essentialServicesCaveat: z.string(),
    forecastDisclaimer: z.string(),
  }),
  retrievedAt: z.string(),
  isFixture: z.boolean(),
});

export const recommendedActionSchema = z.object({
  id: z.string(),
  title: z.string(),
  explanation: z.string(),
  impactCategory: z.enum(["carbon", "cost", "resilience", "informational"]),
  estimatedImpact: z.object({
    annualKgCo2: z.number().nullable(),
    annualGBP: z.number().nullable(),
    note: z.string(),
  }),
  difficulty: z.enum(["low", "medium", "high"]),
  confidence: z.enum(["high", "medium", "low"]),
  assumptions: z.array(z.string()),
  dataSources: z.array(z.string()),
  suggestedNextStep: z.string(),
  priority: z.number(),
});
