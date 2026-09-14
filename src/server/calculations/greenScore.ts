/**
 * The deterministic GreenScore engine. See CALCULATIONS.md for the spec this
 * implements — weights and inputs are fixed there; this file is that spec
 * turned into testable code.
 *
 * PRODUCT_SPEC.md is explicit: "Do not use an LLM to calculate the score."
 * Nothing in this file makes a network call, reads a database, or calls the
 * AI layer — it is a pure function of its inputs, which is what makes it
 * unit-testable and auditable. The AI Advisor (Phase 7) will *explain* a
 * `GreenScoreResult` produced by this file; it will never produce one itself.
 */

import { clamp, lerpScore, levelFor } from "./mathUtils";

export const GREEN_SCORE_FORMULA_VERSION = "1.0.0";

// Fixed in CALCULATIONS.md — do not change without updating that file first.
const WEIGHTS = {
  energyEfficiency: 0.25,
  renewableOpportunity: 0.25,
  carbonOptimisation: 0.2,
  cleantechOpportunity: 0.15,
  userProgress: 0.15,
} as const;

type ComponentKey = keyof typeof WEIGHTS;

export type CarbonIndexLabel = "very low" | "low" | "moderate" | "high" | "very high";

export interface GreenScoreInputs {
  energyProfile?: {
    /** Annual electricity usage in kWh, as supplied by the user. */
    annualUsageKwh?: number | null;
    hasGasHeating?: boolean | null;
    hasEvCharger?: boolean | null;
    hasBattery?: boolean | null;
  } | null;
  /** Only the field this engine actually needs from Phase 3's SolarAssessment. */
  solarAssessment?: {
    annualIrradiationKwhPerM2: number;
  } | null;
  /** Only the fields this engine needs from Phase 2's EnergyNowData. */
  carbonIntensity?: {
    currentIndex: CarbonIndexLabel;
    /** Forecast gCO2/kWh values, if available — used to gauge timing opportunity. */
    forecastValues?: number[] | null;
  } | null;
  /** Not available until Phase 8 (Action Plans) exists to produce it. */
  actionProgress?: {
    completed: number;
    total: number;
  } | null;
}

export interface ComponentScore {
  key: ComponentKey;
  label: string;
  included: boolean;
  /** 0–100, or null if this component was excluded for lack of data. */
  score: number | null;
  /** The weight this component would carry if every component were included. */
  baseWeight: number;
  /** The weight actually used after renormalising across included components. */
  effectiveWeight: number;
  /** Categorical label for display, e.g. the "Solar potential: High" style in PRODUCT_SPEC.md. */
  level: "High" | "Medium" | "Low" | null;
  /** Plain-language reason for the score, or for exclusion. */
  explanation: string;
}

export interface GreenScoreResult {
  totalScore: number;
  formulaVersion: string;
  componentScores: ComponentScore[];
  strengths: string[];
  opportunities: string[];
  /** Renormalisation notes, benchmark values used, and other calculation-level caveats. */
  assumptions: string[];
  dataSources: string[];
  calculatedAt: string; // ISO string
}

export type GreenScoreOutcome =
  | { ok: true; result: GreenScoreResult }
  | { ok: false; reason: "insufficient_data"; message: string };

// ---------------------------------------------------------------------------
// Component 1: Energy efficiency
// ---------------------------------------------------------------------------
// Reference bands are commonly published UK "typical domestic consumption
// value" style benchmarks for annual electricity use. These are ASSUMPTIONS,
// not a measurement of this specific home, and are labelled as such in the
// result. Verify current figures against an authoritative source (e.g.
// Ofgem's published typical consumption values) before relying on this in
// production — see DATA_SOURCES.md's verification caveat, which applies here
// too even though this isn't an external API call.
const ELECTRICITY_ONLY_BANDS = { low: 1800, medium: 2700, high: 4100 };
// All-electric homes (no gas heating) legitimately use much more electricity
// because heating draws from the same meter. This is a rough approximation
// (roughly 2x the electricity-only bands), not a validated benchmark — flagged
// for refinement once real usage data is available to calibrate against.
const ALL_ELECTRIC_BANDS = { low: 3600, medium: 5400, high: 8200 };

function scoreEnergyEfficiency(
  profile: GreenScoreInputs["energyProfile"]
): ComponentScore {
  const base = {
    key: "energyEfficiency" as const,
    label: "Energy efficiency",
    baseWeight: WEIGHTS.energyEfficiency,
  };

  const usage = profile?.annualUsageKwh;
  if (usage === null || usage === undefined) {
    return {
      ...base,
      included: false,
      score: null,
      effectiveWeight: 0,
      level: null,
      explanation:
        "No annual electricity usage was provided, so energy efficiency could not be assessed.",
    };
  }

  const heatingKnown =
    profile?.hasGasHeating !== null && profile?.hasGasHeating !== undefined;
  const bands = profile?.hasGasHeating === false ? ALL_ELECTRIC_BANDS : ELECTRICITY_ONLY_BANDS;

  // Lower usage relative to the benchmark is better (fewer easy efficiency
  // gains remain), hence the score decreases as usage increases.
  let score: number;
  if (usage <= bands.low) {
    score = 100;
  } else if (usage <= bands.medium) {
    score = lerpScore(usage, bands.low, 100, bands.medium, 70);
  } else if (usage <= bands.high) {
    score = lerpScore(usage, bands.medium, 70, bands.high, 40);
  } else {
    // Beyond the "high" band, keep declining but never claim there's zero
    // room — a floor of 10 avoids implying total certainty at the extreme.
    score = lerpScore(usage, bands.high, 40, bands.high * 1.5, 10);
    score = clamp(score, 10, 40);
  }
  score = Math.round(clamp(score, 0, 100));

  const heatingNote = !heatingKnown
    ? " Heating type wasn't provided, so an electricity-only benchmark was used, which may understate efficiency for an all-electric home."
    : profile?.hasGasHeating === false
      ? " An all-electric-home benchmark was used because this property has no gas heating."
      : "";

  return {
    ...base,
    included: true,
    score,
    effectiveWeight: base.baseWeight,
    level: levelFor(score),
    explanation: `Annual usage of ${usage.toLocaleString()} kWh compared against typical UK household bands.${heatingNote}`,
  };
}

// ---------------------------------------------------------------------------
// Component 2: Renewable / solar opportunity
// ---------------------------------------------------------------------------
// Typical UK annual in-plane solar irradiation at a good (≈35°, south-facing)
// tilt ranges roughly from ~950 kWh/m²/yr (northern/inland areas) to
// ~1200 kWh/m²/yr (southern coastal areas). These are approximate, widely-
// cited typical figures, not a precise national dataset — flagged for
// verification against PVGIS's own long-run averages before production use.
const IRRADIATION_LOW_KWH_M2 = 950;
const IRRADIATION_HIGH_KWH_M2 = 1200;

function scoreRenewableOpportunity(
  solar: GreenScoreInputs["solarAssessment"]
): ComponentScore {
  const base = {
    key: "renewableOpportunity" as const,
    label: "Renewable / solar opportunity",
    baseWeight: WEIGHTS.renewableOpportunity,
  };

  if (!solar) {
    return {
      ...base,
      included: false,
      score: null,
      effectiveWeight: 0,
      level: null,
      explanation: "No solar assessment was provided, so solar opportunity could not be assessed.",
    };
  }

  const score = Math.round(
    clamp(
      lerpScore(
        solar.annualIrradiationKwhPerM2,
        IRRADIATION_LOW_KWH_M2,
        40,
        IRRADIATION_HIGH_KWH_M2,
        100
      ),
      0,
      100
    )
  );

  return {
    ...base,
    included: true,
    score,
    effectiveWeight: base.baseWeight,
    level: levelFor(score),
    explanation: `Based on modelled annual solar irradiation of ${Math.round(
      solar.annualIrradiationKwhPerM2
    )} kWh/m² at this location (PVGIS). This measures the location's solar resource, not whether panels are already installed — EnergyProfile does not yet track that (see PROGRESS.md).`,
  };
}

// ---------------------------------------------------------------------------
// Component 3: Electricity-carbon optimisation opportunity
// ---------------------------------------------------------------------------
const INDEX_SCORE: Record<CarbonIndexLabel, number> = {
  "very low": 100,
  low: 80,
  moderate: 55,
  high: 30,
  "very high": 10,
};

function scoreCarbonOptimisation(
  carbon: GreenScoreInputs["carbonIntensity"]
): ComponentScore {
  const base = {
    key: "carbonOptimisation" as const,
    label: "Electricity-carbon optimisation opportunity",
    baseWeight: WEIGHTS.carbonOptimisation,
  };

  if (!carbon) {
    return {
      ...base,
      included: false,
      score: null,
      effectiveWeight: 0,
      level: null,
      explanation:
        "No electricity carbon-intensity data was provided, so timing opportunity could not be assessed.",
    };
  }

  let score = INDEX_SCORE[carbon.currentIndex];
  let variabilityNote = "";

  const values = carbon.forecastValues?.filter((v): v is number => v !== null) ?? [];
  if (values.length >= 2) {
    const spread = Math.max(...values) - Math.min(...values);
    // A wide forecast spread means shifting flexible use to a cleaner period
    // would make a real difference — a genuine additional opportunity signal,
    // capped so it can't push a component past 100.
    if (spread >= 100) {
      score = clamp(score + 10, 0, 100);
      variabilityNote =
        " The forecast shows meaningful variation, meaning shifting flexible electricity use to a cleaner period could make a real difference.";
    }
  } else {
    variabilityNote =
      " Forecast data wasn't available, so this reflects the current grid state only, not upcoming variability.";
  }

  score = Math.round(score);

  return {
    ...base,
    included: true,
    score,
    effectiveWeight: base.baseWeight,
    level: levelFor(score),
    explanation: `Current grid carbon intensity is "${carbon.currentIndex}".${variabilityNote}`,
  };
}

// ---------------------------------------------------------------------------
// Component 4: CleanTech opportunity
// ---------------------------------------------------------------------------
function scoreCleantechOpportunity(
  profile: GreenScoreInputs["energyProfile"]
): ComponentScore {
  const base = {
    key: "cleantechOpportunity" as const,
    label: "CleanTech opportunity",
    baseWeight: WEIGHTS.cleantechOpportunity,
  };

  const signals: { known: boolean; achieved: boolean; label: string }[] = [
    {
      known: profile?.hasEvCharger !== null && profile?.hasEvCharger !== undefined,
      achieved: profile?.hasEvCharger === true,
      label: "EV charger",
    },
    {
      known: profile?.hasBattery !== null && profile?.hasBattery !== undefined,
      achieved: profile?.hasBattery === true,
      label: "battery storage",
    },
    {
      known: profile?.hasGasHeating !== null && profile?.hasGasHeating !== undefined,
      achieved: profile?.hasGasHeating === false,
      label: "non-gas heating",
    },
  ];
  const known = signals.filter((s) => s.known);

  if (known.length === 0) {
    return {
      ...base,
      included: false,
      score: null,
      effectiveWeight: 0,
      level: null,
      explanation:
        "No CleanTech adoption information (EV charger, battery, heating type) was provided.",
    };
  }

  const achievedCount = known.filter((s) => s.achieved).length;
  const score = Math.round((achievedCount / known.length) * 100);
  const achievedLabels = known.filter((s) => s.achieved).map((s) => s.label);
  const missingLabels = known.filter((s) => !s.achieved).map((s) => s.label);

  const parts: string[] = [];
  if (achievedLabels.length > 0) parts.push(`already has: ${achievedLabels.join(", ")}`);
  if (missingLabels.length > 0) parts.push(`does not yet have: ${missingLabels.join(", ")}`);

  return {
    ...base,
    included: true,
    score,
    effectiveWeight: base.baseWeight,
    level: levelFor(score),
    explanation: `Based on ${known.length} of 3 tracked CleanTech signals (${parts.join("; ")}).`,
  };
}

// ---------------------------------------------------------------------------
// Component 5: User action / progress
// ---------------------------------------------------------------------------
function scoreUserProgress(
  progress: GreenScoreInputs["actionProgress"]
): ComponentScore {
  const base = {
    key: "userProgress" as const,
    label: "User action / progress",
    baseWeight: WEIGHTS.userProgress,
  };

  if (!progress || progress.total <= 0) {
    return {
      ...base,
      included: false,
      score: null,
      effectiveWeight: 0,
      level: null,
      explanation:
        "No action plan progress was provided (Action Plans are built in Phase 8), so this component is not yet assessed.",
    };
  }

  const score = Math.round(clamp((progress.completed / progress.total) * 100, 0, 100));

  return {
    ...base,
    included: true,
    score,
    effectiveWeight: base.baseWeight,
    level: levelFor(score),
    explanation: `${progress.completed} of ${progress.total} recommended actions completed.`,
  };
}

/**
 * Computes a GreenScoreResult from whatever inputs are available.
 *
 * Any component whose required input is entirely missing is EXCLUDED, not
 * scored with an invented default — and the remaining components' weights
 * are renormalised to sum to 100%, exactly as CALCULATIONS.md specifies. If
 * every component is excluded, there is nothing to compute a score from, and
 * this function says so explicitly rather than returning a meaningless
 * default number.
 */
export function calculateGreenScore(inputs: GreenScoreInputs): GreenScoreOutcome {
  const components: ComponentScore[] = [
    scoreEnergyEfficiency(inputs.energyProfile),
    scoreRenewableOpportunity(inputs.solarAssessment),
    scoreCarbonOptimisation(inputs.carbonIntensity),
    scoreCleantechOpportunity(inputs.energyProfile),
    scoreUserProgress(inputs.actionProgress),
  ];

  const included = components.filter((c) => c.included && c.score !== null);

  if (included.length === 0) {
    return {
      ok: false,
      reason: "insufficient_data",
      message:
        "Not enough information was provided to calculate a GreenScore. Provide at least one of: an energy profile, a solar assessment, carbon-intensity data, or action-plan progress.",
    };
  }

  const includedWeightSum = included.reduce((sum, c) => sum + c.baseWeight, 0);
  const renormalised = components.map((c) => {
    if (!c.included) return c;
    return { ...c, effectiveWeight: c.baseWeight / includedWeightSum };
  });

  const totalScore = Math.round(
    clamp(
      renormalised.reduce((sum, c) => sum + (c.score ?? 0) * c.effectiveWeight, 0),
      0,
      100
    )
  );

  const strengths = renormalised
    .filter((c) => c.included && (c.score ?? 0) >= 70)
    .map((c) => `${c.label}: ${c.explanation}`);
  const opportunities = renormalised
    .filter((c) => c.included && (c.score ?? 0) < 40)
    .map((c) => `${c.label}: ${c.explanation}`);

  const excluded = components.filter((c) => !c.included);
  const assumptions: string[] = [];
  if (excluded.length > 0) {
    assumptions.push(
      `${excluded.length} of 5 components were excluded for missing data (${excluded
        .map((c) => c.label)
        .join(
          ", "
        )}); the remaining components' weights were renormalised to sum to 100% rather than treating the missing components as zero.`
    );
  }
  assumptions.push(
    "GreenScore is our own transparency-focused score, not an official government rating."
  );
  if (renormalised.find((c) => c.key === "energyEfficiency")?.included) {
    assumptions.push(
      "Energy efficiency uses commonly published UK typical-consumption bands as a benchmark, not a measurement specific to this property."
    );
  }
  if (renormalised.find((c) => c.key === "renewableOpportunity")?.included) {
    assumptions.push(
      "Renewable opportunity measures the location's solar resource (PVGIS), not whether solar is already installed — EnergyProfile does not yet track existing installations."
    );
  }

  const SOURCE_BY_KEY: Record<ComponentKey, string> = {
    energyEfficiency: "User-provided energy profile",
    renewableOpportunity: "PVGIS (via Phase 3 SolarAssessment)",
    carbonOptimisation: "NESO Carbon Intensity API (via Phase 2)",
    cleantechOpportunity: "User-provided energy profile",
    userProgress: "User action-plan progress",
  };
  const dataSources = Array.from(
    new Set(
      renormalised.filter((c) => c.included).map((c) => SOURCE_BY_KEY[c.key])
    )
  );

  return {
    ok: true,
    result: {
      totalScore,
      formulaVersion: GREEN_SCORE_FORMULA_VERSION,
      componentScores: renormalised,
      strengths,
      opportunities,
      assumptions,
      dataSources,
      calculatedAt: new Date().toISOString(),
    },
  };
}
