/**
 * Generates a prioritised action plan from data ALREADY computed by Phases
 * 4-6 (GreenScore, SolarScore, Energy Now). Pure and deterministic, same
 * discipline as every other file in this folder — no I/O, no LLM call.
 *
 * PRODUCT_SPEC.md, Phase 8: "The system should generate a prioritised list
 * of recommended actions using deterministic application rules first...
 * the underlying recommendations must originate from structured application
 * logic," even though the AI Advisor (Phase 7) may explain and personalise
 * them afterward. This file IS that structured application logic.
 *
 * Deliberately conservative about which rules exist: every rule here fires
 * only on a genuine signal already present in computed data (a real
 * suitability score, a real forecast-based timing opportunity, a real
 * efficiency shortfall). There is no rule suggesting a specific purchase
 * (e.g. "get an EV charger") on the strength of its absence alone — V1 has
 * no signal that a given household wants or needs one, and recommending a
 * specific product from an absence would read as presumptuous, not helpful.
 */

import type { GreenScoreResult } from "./greenScore";
import type { SolarScoreResult } from "./solarScore";
import type { EnergyNowInterpretation } from "./energyNowInterpretation";

export type ImpactCategory = "carbon" | "cost" | "resilience" | "informational";
export type Difficulty = "low" | "medium" | "high";
export type Confidence = "high" | "medium" | "low";

export interface EstimatedImpact {
  annualKgCo2: number | null;
  annualGBP: number | null;
  /** Always present — explains what the numbers (or their absence) mean, per "do not present uncertain calculations as guaranteed savings." */
  note: string;
}

export interface RecommendedAction {
  id: string;
  title: string;
  explanation: string;
  impactCategory: ImpactCategory;
  estimatedImpact: EstimatedImpact;
  difficulty: Difficulty;
  confidence: Confidence;
  assumptions: string[];
  dataSources: string[];
  suggestedNextStep: string;
  /** 1 = highest priority. Assigned after sorting — see sortActions below. */
  priority: number;
}

export interface ActionPlanInputs {
  greenScore?: GreenScoreResult | null;
  solarScore?: SolarScoreResult | null;
  energyNow?: { interpretation: EnergyNowInterpretation } | null;
}

export interface ActionPlanResult {
  actions: RecommendedAction[];
  /** Explains an empty list, or states the general provenance/limits of what's here. */
  notes: string[];
  calculatedAt: string;
}

// CALCULATIONS.md, fixed at Phase 0: "1. Estimated impact category weight
// (carbon > cost > resilience...)". "informational" (data-completion nudges)
// is deliberately below all three real-impact categories, added here rather
// than in the original Phase 0 spec since it only became necessary once
// real recommendation types existed to sort.
const CATEGORY_WEIGHT: Record<ImpactCategory, number> = {
  carbon: 3,
  cost: 2,
  resilience: 1,
  informational: 0,
};
// CALCULATIONS.md: "2. Difficulty (lower difficulty ranks higher at equal impact)".
const DIFFICULTY_RANK: Record<Difficulty, number> = { low: 3, medium: 2, high: 1 };
// CALCULATIONS.md: "3. Confidence (higher-confidence ranks above speculative at equal impact/difficulty)".
const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

function buildSolarAction(solarScore: SolarScoreResult): RecommendedAction {
  const isPromising = solarScore.suitability !== "Low";
  return {
    id: "investigate-solar",
    title: isPromising
      ? "Investigate solar suitability"
      : "Solar isn't a strong fit right now, but worth revisiting later",
    explanation: isPromising
      ? `Your SolarScore shows ${solarScore.suitability} suitability, with an estimated ${solarScore.annualGenerationKwh} kWh/year of generation at this location.`
      : `Your SolarScore shows Low suitability (${solarScore.suitabilitySubScore}/100) at this location — solar is unlikely to be a strong fit today, though this could change if PVGIS data, panel efficiency, or your circumstances change.`,
    impactCategory: "carbon",
    estimatedImpact: {
      annualKgCo2: solarScore.emissionsReduction.annualKgCo2,
      annualGBP: solarScore.financialOpportunity.available
        ? solarScore.financialOpportunity.indicativeAnnualSavingGBP
        : null,
      note: solarScore.financialOpportunity.available
        ? "Estimated, indicative figures based on modelled generation — not a guarantee. See SolarScore's own assumptions for the price and self-consumption rate used."
        : "Emissions figure is a modelled estimate; a financial saving figure isn't available (no electricity price was supplied) — not calculated rather than guessed.",
    },
    difficulty: "high", // Requires a real purchase/installation decision and a qualified installer.
    confidence: "medium", // SolarScore's own confidence is "modelled-estimate", not a measurement.
    assumptions: solarScore.assumptions,
    dataSources: solarScore.dataSources,
    suggestedNextStep: isPromising
      ? "Get a quote from an MCS-certified solar installer to confirm feasibility, shading, and cost for your specific roof."
      : "Revisit this if your circumstances change (e.g. a house move) or if you want a second opinion from an installer despite the modelled Low suitability.",
    priority: 0, // assigned by sortActions
  };
}

function buildFlexibleUseAction(interpretation: EnergyNowInterpretation): RecommendedAction | null {
  if (!interpretation.flexibleUseSuggestion.available) return null;
  const suggestion = interpretation.flexibleUseSuggestion;
  return {
    id: "shift-flexible-use",
    title: "Shift flexible electricity use to lower-carbon periods",
    explanation: suggestion.message,
    impactCategory: "carbon",
    estimatedImpact: {
      annualKgCo2: null,
      annualGBP: null,
      note: "No specific figure is calculated — the actual impact depends on how much flexible electricity use you're able to shift and how often. This is a forecast-based timing suggestion, not a certainty.",
    },
    difficulty: "low", // A habit/timing change, not a purchase.
    confidence: "medium", // Based on a forecast, which can change.
    assumptions: [interpretation.essentialServicesCaveat, interpretation.forecastDisclaimer],
    dataSources: ["NESO Carbon Intensity API (via Phase 2)"],
    suggestedNextStep: "Check the Energy Now screen before running flexible appliances like a washing machine, dishwasher, EV charger, or battery charging.",
    priority: 0,
  };
}

function buildEfficiencyAction(greenScore: GreenScoreResult): RecommendedAction | null {
  const component = greenScore.componentScores.find((c) => c.key === "energyEfficiency");
  if (!component?.included || component.score === null || component.score >= 70) return null;
  return {
    id: "review-energy-efficiency",
    title: "Review household energy efficiency",
    explanation: component.explanation,
    impactCategory: "cost",
    estimatedImpact: {
      annualKgCo2: null,
      annualGBP: null,
      note: "No specific figure is calculated — potential savings depend entirely on which efficiency improvements you make, which this system doesn't know without more detail.",
    },
    difficulty: "medium",
    confidence: "medium", // GreenScore's own benchmark bands are approximations, not a measurement.
    assumptions: greenScore.assumptions.filter((a) => a.toLowerCase().includes("efficiency") || a.toLowerCase().includes("benchmark")),
    dataSources: ["User-provided energy profile"],
    suggestedNextStep: "Review your last few energy bills to see where usage is highest, and consider a home energy audit for a more detailed picture.",
    priority: 0,
  };
}

function buildDataCompletionAction(greenScore: GreenScoreResult): RecommendedAction | null {
  const excluded = greenScore.componentScores.filter((c) => !c.included);
  if (excluded.length === 0) return null;
  return {
    id: "complete-your-profile",
    title: "Add more information to sharpen your GreenScore",
    explanation: `${excluded.length} of 5 GreenScore components (${excluded
      .map((c) => c.label)
      .join(", ")}) couldn't be assessed without more information.`,
    impactCategory: "informational",
    estimatedImpact: {
      annualKgCo2: null,
      annualGBP: null,
      note: "This action doesn't reduce emissions or cost directly — it improves the accuracy of the recommendations you receive.",
    },
    difficulty: "low",
    confidence: "high", // Which components are excluded is a plain fact, not an estimate.
    assumptions: [],
    dataSources: ["GreenScore result"],
    suggestedNextStep: "Fill in your energy profile (usage, heating type, EV charger, battery) in Settings.",
    priority: 0,
  };
}

/** CALCULATIONS.md's 3-key lexicographic order: category, then difficulty, then confidence. */
function sortActions(actions: RecommendedAction[]): RecommendedAction[] {
  const sorted = [...actions].sort((a, b) => {
    const categoryDiff = CATEGORY_WEIGHT[b.impactCategory] - CATEGORY_WEIGHT[a.impactCategory];
    if (categoryDiff !== 0) return categoryDiff;
    const difficultyDiff = DIFFICULTY_RANK[b.difficulty] - DIFFICULTY_RANK[a.difficulty];
    if (difficultyDiff !== 0) return difficultyDiff;
    return CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  });
  return sorted.map((action, index) => ({ ...action, priority: index + 1 }));
}

export function generateActionPlan(inputs: ActionPlanInputs): ActionPlanResult {
  const candidates: RecommendedAction[] = [];

  if (inputs.solarScore) candidates.push(buildSolarAction(inputs.solarScore));

  const flexibleUseAction = inputs.energyNow
    ? buildFlexibleUseAction(inputs.energyNow.interpretation)
    : null;
  if (flexibleUseAction) candidates.push(flexibleUseAction);

  if (inputs.greenScore) {
    const efficiencyAction = buildEfficiencyAction(inputs.greenScore);
    if (efficiencyAction) candidates.push(efficiencyAction);

    const dataCompletionAction = buildDataCompletionAction(inputs.greenScore);
    if (dataCompletionAction) candidates.push(dataCompletionAction);
  }

  const notes: string[] = [
    "Recommendations are generated from structured application logic (GreenScore, SolarScore, Energy Now results) already computed elsewhere in this system — never invented or altered by the AI Advisor.",
  ];
  if (candidates.length === 0) {
    notes.push(
      "No recommendations could be generated — provide at least a GreenScore, SolarScore, or Energy Now result to receive personalised suggestions."
    );
  }

  return {
    actions: sortActions(candidates),
    notes,
    calculatedAt: new Date().toISOString(),
  };
}
