import { describe, it, expect } from "vitest";
import {
  interpretEnergyNow,
  ESSENTIAL_SERVICES_CAVEAT,
  FORECAST_DISCLAIMER,
} from "@/server/calculations/energyNowInterpretation";

const NOW = new Date("2026-09-14T11:00:00.000Z"); // a Monday, 11:00 UTC

function period(overrides: Partial<{ from: string; to: string; forecast: number | null; actual: number | null; index: any }>) {
  return {
    from: "2026-09-14T11:00Z",
    to: "2026-09-14T11:30Z",
    forecast: 150,
    actual: 152,
    index: "moderate" as const,
    ...overrides,
  };
}

describe("interpretEnergyNow — current summary", () => {
  it.each([
    ["very low", "very low-carbon"],
    ["low", "relatively low-carbon"],
    ["moderate", "moderate carbon intensity"],
    ["high", "relatively high-carbon"],
    ["very high", "very high-carbon"],
  ] as const)("produces a summary for index '%s' containing '%s'", (index, expectedFragment) => {
    const result = interpretEnergyNow(
      { current: period({ index }), forecast: { available: false, reason: "n/a" } },
      NOW
    );
    expect(result.currentIndex).toBe(index);
    expect(result.currentSummary).toContain(expectedFragment);
  });

  it("always includes the essential-services caveat and forecast disclaimer", () => {
    const result = interpretEnergyNow(
      { current: period({}), forecast: { available: false, reason: "n/a" } },
      NOW
    );
    expect(result.essentialServicesCaveat).toBe(ESSENTIAL_SERVICES_CAVEAT);
    expect(result.forecastDisclaimer).toBe(FORECAST_DISCLAIMER);
    expect(result.essentialServicesCaveat.toLowerCase()).toContain("not a suggestion to change heating");
  });
});

describe("interpretEnergyNow — flexible-use suggestion: forecast unavailable", () => {
  it("passes through the forecast's own unavailable reason", () => {
    const result = interpretEnergyNow(
      {
        current: period({}),
        forecast: { available: false, reason: "Forecast electricity carbon-intensity data is temporarily unavailable." },
      },
      NOW
    );
    expect(result.flexibleUseSuggestion.available).toBe(false);
    if (!result.flexibleUseSuggestion.available) {
      expect(result.flexibleUseSuggestion.reason).toBe(
        "Forecast electricity carbon-intensity data is temporarily unavailable."
      );
    }
  });

  it("is unavailable when every forecast period has a null forecast value", () => {
    const result = interpretEnergyNow(
      {
        current: period({ actual: 150, forecast: 150 }),
        forecast: { available: true, periods: [period({ forecast: null }), period({ forecast: null })] },
      },
      NOW
    );
    expect(result.flexibleUseSuggestion.available).toBe(false);
    if (!result.flexibleUseSuggestion.available) {
      expect(result.flexibleUseSuggestion.reason).toMatch(/none had a usable forecast/i);
    }
  });
});

describe("interpretEnergyNow — flexible-use suggestion: meaningful-improvement threshold", () => {
  it("does not suggest a window that is only marginally better than current", () => {
    const result = interpretEnergyNow(
      {
        current: period({ actual: 150, forecast: 150 }),
        forecast: { available: true, periods: [period({ forecast: 140 })] }, // only 10 lower
      },
      NOW
    );
    expect(result.flexibleUseSuggestion.available).toBe(false);
    if (!result.flexibleUseSuggestion.available) {
      expect(result.flexibleUseSuggestion.reason).toMatch(/already close to the best/i);
    }
  });

  it("suggests the best window when it is meaningfully cleaner than current", () => {
    const result = interpretEnergyNow(
      {
        current: period({ actual: 150, forecast: 150 }),
        forecast: {
          available: true,
          periods: [period({ forecast: 140 }), period({ forecast: 100, index: "low" })],
        },
      },
      NOW
    );
    expect(result.flexibleUseSuggestion.available).toBe(true);
    if (result.flexibleUseSuggestion.available) {
      expect(result.flexibleUseSuggestion.forecastGCo2PerKwh).toBe(100); // picks the best, not just any qualifying period
      expect(result.flexibleUseSuggestion.index).toBe("low");
      expect(result.flexibleUseSuggestion.message).toMatch(/better time for flexible electricity use/i);
    }
  });

  it("falls back to current.forecast when current.actual is null", () => {
    const result = interpretEnergyNow(
      {
        current: period({ actual: null, forecast: 150 }),
        forecast: { available: true, periods: [period({ forecast: 100 })] },
      },
      NOW
    );
    expect(result.flexibleUseSuggestion.available).toBe(true);
  });
});

describe("interpretEnergyNow — timing labels", () => {
  it("labels a period later the same UTC day as 'later today (<time of day>)'", () => {
    const result = interpretEnergyNow(
      {
        current: period({ actual: 150, forecast: 150 }),
        forecast: {
          available: true,
          periods: [period({ from: "2026-09-14T15:00Z", to: "2026-09-14T15:30Z", forecast: 80 })],
        },
      },
      NOW
    );
    if (result.flexibleUseSuggestion.available) {
      expect(result.flexibleUseSuggestion.timingLabel).toBe("later today (afternoon)");
    } else {
      throw new Error("expected a suggestion");
    }
  });

  it("labels a period the next UTC day as 'tomorrow <time of day>'", () => {
    const result = interpretEnergyNow(
      {
        current: period({ actual: 150, forecast: 150 }),
        forecast: {
          available: true,
          periods: [period({ from: "2026-09-15T08:00Z", to: "2026-09-15T08:30Z", forecast: 80 })],
        },
      },
      NOW
    );
    if (result.flexibleUseSuggestion.available) {
      expect(result.flexibleUseSuggestion.timingLabel).toBe("tomorrow morning");
    } else {
      throw new Error("expected a suggestion");
    }
  });

  it("labels a period more than a day out as indicative-only rather than a specific day-part", () => {
    const result = interpretEnergyNow(
      {
        current: period({ actual: 150, forecast: 150 }),
        forecast: {
          available: true,
          periods: [period({ from: "2026-09-17T08:00Z", to: "2026-09-17T08:30Z", forecast: 80 })],
        },
      },
      NOW
    );
    if (result.flexibleUseSuggestion.available) {
      expect(result.flexibleUseSuggestion.timingLabel).toMatch(/beyond the next day/i);
    } else {
      throw new Error("expected a suggestion");
    }
  });
});
