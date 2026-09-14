/**
 * Builds the structured "grounding context" PRODUCT_SPEC.md's Phase 7
 * requires: "Before calling the AI, construct a structured context object
 * containing: location, GreenScore, GreenScore component explanations,
 * SolarAssessment, EnergyNow data, recommendations, assumptions, data source
 * metadata, timestamps."
 *
 * This file is pure and deterministic — no I/O, no LLM call — for the same
 * reason greenScore.ts and solarScore.ts are: it's the one place that
 * decides exactly what the AI is allowed to see, so it needs to be
 * reviewable and testable on its own, independent of whether the AI call
 * that follows behaves correctly.
 *
 * Nothing here calls the AI or fabricates a fact. If a piece of data wasn't
 * supplied, the rendered context says so explicitly ("not available") rather
 * than omitting it silently — an omission could read to the model (or a
 * reviewer) as "this wasn't relevant" rather than "this wasn't provided".
 */

import type { GreenScoreResult } from "../calculations/greenScore";
import type { SolarScoreResult } from "../calculations/solarScore";
import type { EnergyNowInterpretation } from "../calculations/energyNowInterpretation";
import type { RecommendedAction } from "../calculations/actionPlan";

export interface LocationContext {
  postcodeOutward: string;
  region: string | null;
  adminDistrict: string | null;
}

export interface EnergyNowContext {
  current: { index: string; actual: number | null; from: string; to: string };
  interpretation: EnergyNowInterpretation;
  retrievedAt: string;
  isFixture: boolean;
}

export interface GroundingContextInput {
  location?: LocationContext | null;
  greenScore?: GreenScoreResult | null;
  solarScore?: SolarScoreResult | null;
  energyNow?: EnergyNowContext | null;
  /** Now populated from Phase 8's deterministic generateActionPlan(); still optional since not every call assembles one. */
  recommendations?: RecommendedAction[] | null;
}

/**
 * The rendered, human-and-model-readable context block. Deliberately plain
 * text with clear section headers rather than raw JSON — easier for the
 * model to quote accurately, and easier for a human reviewer (or the eval
 * harness) to read when checking a transcript for grounding violations.
 */
export function renderGroundingContext(input: GroundingContextInput): string {
  const sections: string[] = [];

  sections.push(renderLocationSection(input.location ?? null));
  sections.push(renderGreenScoreSection(input.greenScore ?? null));
  sections.push(renderSolarScoreSection(input.solarScore ?? null));
  sections.push(renderEnergyNowSection(input.energyNow ?? null));
  sections.push(renderRecommendationsSection(input.recommendations ?? null));

  return sections.join("\n\n");
}

function renderLocationSection(location: LocationContext | null): string {
  if (!location) return "LOCATION: not available.";
  return [
    "LOCATION:",
    `- Postcode area: ${location.postcodeOutward}`,
    `- Region: ${location.region ?? "unknown"}`,
    `- Admin district: ${location.adminDistrict ?? "unknown"}`,
  ].join("\n");
}

function renderGreenScoreSection(greenScore: GreenScoreResult | null): string {
  if (!greenScore) return "GREEN_SCORE: not available. Do not state or estimate a GreenScore.";

  const lines = [
    "GREEN_SCORE:",
    `- Total score: ${greenScore.totalScore}/100 (formula version ${greenScore.formulaVersion})`,
    `- This is our own transparency-focused score, not an official government rating.`,
    "- Components:",
  ];
  for (const c of greenScore.componentScores) {
    if (!c.included) {
      lines.push(`  - ${c.label}: not assessed (no data provided). ${c.explanation}`);
    } else {
      lines.push(`  - ${c.label}: ${c.score}/100 (${c.level}). ${c.explanation}`);
    }
  }
  if (greenScore.strengths.length > 0) {
    lines.push("- Strengths: " + greenScore.strengths.join(" | "));
  }
  if (greenScore.opportunities.length > 0) {
    lines.push("- Opportunities: " + greenScore.opportunities.join(" | "));
  }
  lines.push("- Assumptions: " + greenScore.assumptions.join(" | "));
  lines.push("- Data sources: " + (greenScore.dataSources.join(", ") || "none"));
  lines.push(`- Calculated at: ${greenScore.calculatedAt}`);
  return lines.join("\n");
}

function renderSolarScoreSection(solarScore: SolarScoreResult | null): string {
  if (!solarScore) {
    return "SOLAR_SCORE: not available. Do not state or estimate solar generation, suitability, savings, or emissions figures.";
  }

  const lines = [
    "SOLAR_SCORE:",
    `- Suitability: ${solarScore.suitability} (sub-score ${solarScore.suitabilitySubScore}/100)`,
    `- Estimated annual generation: ${solarScore.annualGenerationKwh} kWh (${solarScore.generationPerKwp} kWh per kWp)`,
    `- Solar resource: ${solarScore.solarResource.annualIrradiationKwhPerM2} kWh/m²/year`,
    `- Estimated emissions reduction: ${solarScore.emissionsReduction.annualKgCo2} kg CO2/year (${
      solarScore.emissionsReduction.isAssumedGridIntensity ? "assumed" : "supplied"
    } grid intensity of ${solarScore.emissionsReduction.gridIntensityGCo2PerKwh} gCO2/kWh)`,
  ];
  if (solarScore.financialOpportunity.available) {
    lines.push(
      `- Indicative financial opportunity: £${solarScore.financialOpportunity.indicativeAnnualSavingGBP}/year (assumes ${Math.round(
        solarScore.financialOpportunity.selfConsumptionRateAssumed * 100
      )}% self-consumption at ${solarScore.financialOpportunity.electricityPricePencePerKwh}p/kWh — this is an indicative estimate, not a guarantee)`
    );
  } else {
    lines.push(
      `- Financial opportunity: not available (${solarScore.financialOpportunity.reason}). Do not state or estimate a specific saving figure.`
    );
  }
  lines.push("- Limitations: " + solarScore.limitations.join(" | "));
  lines.push(`- Calculated at: ${solarScore.calculatedAt}`);
  return lines.join("\n");
}

function renderEnergyNowSection(energyNow: EnergyNowContext | null): string {
  if (!energyNow) return "ENERGY_NOW: not available.";

  const lines = [
    "ENERGY_NOW:",
    `- Current grid carbon intensity index: ${energyNow.current.index}${
      energyNow.current.actual !== null ? ` (${energyNow.current.actual} gCO2/kWh)` : ""
    }`,
    `- Interpretation: ${energyNow.interpretation.currentSummary}`,
  ];
  if (energyNow.interpretation.flexibleUseSuggestion.available) {
    lines.push(
      `- Flexible-use suggestion: ${energyNow.interpretation.flexibleUseSuggestion.message} (this is a FORECAST, not a certainty)`
    );
  } else {
    lines.push(
      `- Flexible-use suggestion: none currently (${energyNow.interpretation.flexibleUseSuggestion.reason})`
    );
  }
  lines.push(`- ${energyNow.interpretation.essentialServicesCaveat}`);
  lines.push(`- Data retrieved at: ${energyNow.retrievedAt}${energyNow.isFixture ? " (demo/fixture data)" : ""}`);
  return lines.join("\n");
}

function renderRecommendationsSection(
  recommendations: GroundingContextInput["recommendations"]
): string {
  if (!recommendations || recommendations.length === 0) {
    return "RECOMMENDATIONS: not available yet (no GreenScore, SolarScore, or Energy Now data was supplied to generate any). Do not invent a prioritised action list — you may still discuss general opportunities visible in the other sections above.";
  }
  const lines = ["RECOMMENDATIONS (in priority order — generated by deterministic rules, not by you):"];
  for (const r of recommendations) {
    const impactParts: string[] = [];
    if (r.estimatedImpact.annualKgCo2 !== null) impactParts.push(`${r.estimatedImpact.annualKgCo2} kg CO2/year`);
    if (r.estimatedImpact.annualGBP !== null) impactParts.push(`£${r.estimatedImpact.annualGBP}/year`);
    const impactText = impactParts.length > 0 ? impactParts.join(", ") : "no specific figure calculated";
    lines.push(
      `- [Priority ${r.priority}] ${r.title} (${r.impactCategory}, ${r.difficulty} difficulty, ${r.confidence} confidence): ${r.explanation} Estimated impact: ${impactText} — ${r.estimatedImpact.note} Suggested next step: ${r.suggestedNextStep}`
    );
  }
  return lines.join("\n");
}
