/**
 * Turns Phase 2's raw CarbonIntensityService output into the plain-language
 * interpretation PRODUCT_SPEC.md's Energy Now screen needs — e.g.
 * "Electricity is currently relatively low-carbon." and "Tomorrow afternoon
 * may be a better period for flexible electricity use."
 *
 * Deterministic and rule-based, like GreenScore and SolarScore: no LLM call.
 * The wording here is fixed, reviewable copy, not a text-generation task —
 * PRODUCT_SPEC.md's instruction to "never claim certainty where the API
 * provides only a forecast" is much easier to guarantee in a lookup table
 * than in freeform generated text.
 *
 * `now` is an explicit parameter rather than read from the system clock
 * internally, so this stays a pure function and every "today vs tomorrow"
 * case can be tested deterministically without mocking Date.
 */

import type { CarbonIndexLabel } from "./greenScore";
// Reusing GreenScore's index-label union rather than declaring a third copy
// of the same 5 strings (carbonIntensityAdapter.ts in Phase 2 has its own,
// schema-derived version) — a minor pre-existing duplication across the
// project, not introduced here, and not worth a bigger refactor for V1.
export type { CarbonIndexLabel };

interface Period {
  from: string;
  to: string;
  forecast: number | null;
  actual: number | null;
  index: CarbonIndexLabel;
}

export interface EnergyNowInterpretationInput {
  current: Period;
  forecast:
    | { available: true; periods: Period[] }
    | { available: false; reason: string };
}

export type FlexibleUseSuggestion =
  | {
      available: true;
      from: string;
      to: string;
      /** Coarse, honestly-labelled timing — never more precise than the data supports. */
      timingLabel: string;
      forecastGCo2PerKwh: number;
      index: CarbonIndexLabel;
      message: string;
    }
  | { available: false; reason: string };

export interface EnergyNowInterpretation {
  currentSummary: string;
  currentIndex: CarbonIndexLabel;
  flexibleUseSuggestion: FlexibleUseSuggestion;
  /**
   * PRODUCT_SPEC.md, Phase 6: "Do not tell users to change medically
   * necessary heating or other essential services." Surfaced explicitly so a
   * UI can't accidentally present the suggestion as covering everything.
   */
  essentialServicesCaveat: string;
  forecastDisclaimer: string;
}

const CURRENT_SUMMARY_BY_INDEX: Record<CarbonIndexLabel, string> = {
  "very low":
    "Electricity is currently very low-carbon — a good time for flexible electricity use.",
  low: "Electricity is currently relatively low-carbon.",
  moderate: "Electricity is currently at a moderate carbon intensity.",
  high: "Electricity is currently relatively high-carbon.",
  "very high":
    "Electricity is currently very high-carbon — consider delaying flexible electricity use if you can.",
};

export const ESSENTIAL_SERVICES_CAVEAT =
  "This applies to flexible, discretionary electricity use only — things like EV charging, washing machines, dishwashers, or battery charging. It is not a suggestion to change heating or any other essential service.";

export const FORECAST_DISCLAIMER =
  "This is based on a forecast, not a certainty — actual grid conditions can change.";

// How much lower (in gCO2/kWh) a forecast period must be than the current
// value before it's worth surfacing as "a better time" — avoids suggesting
// a change for a negligible difference. A judgement call, not a published
// standard; documented here so it can be revisited.
const MEANINGFUL_IMPROVEMENT_THRESHOLD_G_CO2_PER_KWH = 15;

function timingLabel(periodStart: Date, now: Date): string {
  const dayDiff = Math.floor(
    (Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), periodStart.getUTCDate()) -
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      (24 * 60 * 60 * 1000)
  );

  const hour = periodStart.getUTCHours();
  const timeOfDay =
    hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

  if (dayDiff === 0) return `later today (${timeOfDay})`;
  if (dayDiff === 1) return `tomorrow ${timeOfDay}`;
  // More than a day out is further than a half-hourly forecast can speak to
  // with any real confidence — say so plainly rather than inventing a label.
  return `around ${periodStart.toISOString().replace(":00.000Z", "Z")} (beyond the next day, so treat as indicative only)`;
}

function findFlexibleUseSuggestion(
  input: EnergyNowInterpretationInput,
  now: Date
): FlexibleUseSuggestion {
  if (!input.forecast.available) {
    return { available: false, reason: input.forecast.reason };
  }

  const currentValue = input.current.actual ?? input.current.forecast;
  const candidates = input.forecast.periods.filter(
    (p): p is Period & { forecast: number } => p.forecast !== null
  );

  if (candidates.length === 0) {
    return {
      available: false,
      reason: "Forecast periods were returned but none had a usable forecast value.",
    };
  }

  const best = candidates.reduce((min, p) => (p.forecast < min.forecast ? p : min));

  if (currentValue !== null && currentValue - best.forecast < MEANINGFUL_IMPROVEMENT_THRESHOLD_G_CO2_PER_KWH) {
    return {
      available: false,
      reason:
        "No significantly cleaner window was found in the forecast — current conditions are already close to the best expected in this period.",
    };
  }

  const label = timingLabel(new Date(best.from), now);
  return {
    available: true,
    from: best.from,
    to: best.to,
    timingLabel: label,
    forecastGCo2PerKwh: best.forecast,
    index: best.index,
    message: `${label.charAt(0).toUpperCase() + label.slice(1)} may be a better time for flexible electricity use.`,
  };
}

export function interpretEnergyNow(
  input: EnergyNowInterpretationInput,
  now: Date = new Date()
): EnergyNowInterpretation {
  return {
    currentSummary: CURRENT_SUMMARY_BY_INDEX[input.current.index],
    currentIndex: input.current.index,
    flexibleUseSuggestion: findFlexibleUseSuggestion(input, now),
    essentialServicesCaveat: ESSENTIAL_SERVICES_CAVEAT,
    forecastDisclaimer: FORECAST_DISCLAIMER,
  };
}
