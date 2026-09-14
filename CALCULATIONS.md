# Calculations

This document is the single source of truth for how GreenScore, SolarScore and
recommendation priority are computed. **Nothing in this file is implemented
yet** (that's Phases 4/5/8) — it exists now, in Phase 0, so that when those
phases are built they implement *this* spec rather than inventing their own
on the day, and so reviewers can check the eventual code against a spec
written before the code existed.

Whichever phase implements a section of this file must update it if the real
implementation deviates, and explain why in `PROGRESS.md`.

## Ground rules (apply to every calculation below)
1. Every calculation is deterministic and unit-testable — no LLM call is ever
   part of computing a number.
2. Every score exposes its component parts and the reason for each, not just
   a final number.
3. Missing input data reduces *confidence*, never gets silently replaced with
   an invented default that looks like a real value.
4. GreenScore is never described as an official or government rating.
5. Version every formula (a `formulaVersion` field alongside each stored
   score) so historical scores remain interpretable if the formula changes.

## GreenScore (Phase 4 — implemented, see `src/server/calculations/greenScore.ts`)

`GreenScoreResult.totalScore` (0–100) is a weighted sum of five component
scores, each independently 0–100:

| Component | Weight | Depends on |
|---|---|---|
| Energy efficiency opportunity | 25% | `EnergyProfile` (usage, heating type) |
| Renewable / solar opportunity | 25% | `SolarAssessment` (Phase 3 output) |
| Electricity-carbon optimisation opportunity | 20% | `CarbonIntensityRecord` history/forecast |
| CleanTech opportunity | 15% | Presence/absence of EV charger, battery, heat pump (user-provided) |
| User action / progress | 15% | Completed `Recommendation`/`ActionPlan` items |

`totalScore = round(0.25*efficiency + 0.25*solar + 0.20*carbonTiming + 0.15*cleantech + 0.15*progress)`

If a component's required input is entirely missing, it is **excluded** from
the weighted sum and the remaining components' weights are renormalised to
sum to 100% — never treated as a zero. If every component is excluded,
`calculateGreenScore` returns `{ ok: false, reason: "insufficient_data" }`
rather than a fabricated number. `GreenScoreResult.assumptions` always states
which components (if any) were excluded and why.

### Component 1 — Energy efficiency
Compares `EnergyProfile.annualUsageKwh` against a three-band reference
(low/medium/high), scored 100 → 70 → 40 → floor of 10, piecewise-linear
between bands. Two benchmark sets are used depending on `hasGasHeating`:
- **Electricity-only home** (`hasGasHeating: true`, or unknown): 1,800 /
  2,700 / 4,100 kWh/year (commonly published UK "typical domestic
  consumption value" style bands — an assumption, not this property's
  measurement; verify against an authoritative current source, e.g. Ofgem's
  published TDCVs, before production use).
- **All-electric home** (`hasGasHeating: false`): 3,600 / 5,400 / 8,200
  kWh/year — a rough ~2× approximation acknowledging that electric heating
  draws from the same meter, not a validated benchmark. Flagged for
  refinement once real usage data exists to calibrate it.
Excluded entirely if `annualUsageKwh` is not provided.

### Component 2 — Renewable / solar opportunity
Scored from `SolarAssessment.annualIrradiationKwhPerM2` (Phase 3's raw
physical solar-resource figure, decoupled from any assumed system size):
950 kWh/m²/yr → 40, 1,200 kWh/m²/yr → 100, linear between and clamped
outside. These reference points are approximate typical UK irradiation
figures, not a precise dataset — flagged for verification against PVGIS's
own long-run averages.

**Known limitation**: this measures the location's solar *resource*, not
whether solar is already installed — `EnergyProfile` does not currently
track an existing installation. Adding a `hasSolarPanels`-style field is a
candidate follow-up before this component can distinguish "great untapped
opportunity" from "already captured."

### Component 3 — Electricity-carbon optimisation opportunity
Base score from the current NESO index on a fixed ordinal scale: very low=100,
low=80, moderate=55, high=30, very high=10. If forecast values are available
and their spread (max − min gCO2/kWh) is ≥100, a +10 "timing opportunity"
boost is added (capped at 100) — a wide spread means shifting flexible usage
to a cleaner period would make a real difference. No boost, and an explicit
note, when forecast data isn't available.

### Component 4 — CleanTech opportunity
Averages three known/unknown signals from `EnergyProfile`: `hasEvCharger`,
`hasBattery`, and non-gas heating (`hasGasHeating === false`). Each known
signal contributes equally; unknown signals are excluded from the average
(never assumed false). Score = `round(100 * achievedCount / knownCount)`.
Excluded entirely if none of the three signals are known.

Note the asymmetry with Component 2: here, "opportunity" is scored as
*already-achieved adoption* (already has an EV charger = higher score),
whereas Component 2 scores *available* potential regardless of whether it's
been acted on. This is a genuine inconsistency in what "opportunity" means
across components, inherited from the product brief's naming and made
explicit here rather than silently smoothed over — Phase 5/8 should revisit
whether a single consistent definition is worth adopting.

### Component 5 — User action / progress
`round(100 * completed / total)` from an `{ completed, total }` pair,
clamped to 100. Excluded when not provided (this is what happens for all V1
calls today — Phase 8, Action Plans, is what will supply real values) or
when `total` is 0.

### Output shape
```
GreenScoreResult {
  totalScore, formulaVersion, componentScores[], strengths[],
  opportunities[], assumptions[], dataSources[], calculatedAt
}
```
`componentScores` includes every component (even excluded ones, with
`score: null`) so a caller can always see the full picture, not just what
was included. `strengths` lists included components scoring ≥70;
`opportunities` lists those scoring <40. `formulaVersion` (currently
`"1.0.0"`) is stored so a historical score remains interpretable if this
formula changes later.

## SolarScore (Phase 5 — implemented, see `src/server/calculations/solarScore.ts`)

Unlike GreenScore, a `SolarAssessment` (Phase 3) is a **required** input —
there is no meaningful SolarScore without it, so it isn't an excludable
component. Financial opportunity, however, is genuinely optional within the
result, exactly as this section originally specified.

### Solar suitability
`generationPerKwp = annualGenerationKwh / assumptions.peakPowerKw`, then
scored on a 0–100 scale against a typical UK reference range of ~700 (poor)
to ~1,000 (good) kWh/kWp/year, using the same piecewise-linear approach as
GreenScore, with a floor segment below 700 so a very poor site keeps
differentiating downward instead of flatlining at "Medium" — mirroring the
floor GreenScore's energy-efficiency component uses at its own bad end, just
at the opposite end of this scale. Bucketed into High/Medium/Low using the
project-wide ≥70/≥40/else convention (`levelFor` in `mathUtils.ts`, shared
with GreenScore). The 700–1,000 reference range is an approximate, commonly
cited figure, not a precise national dataset — verify against current
PVGIS/industry figures before production use.

### Estimated annual PV generation
Taken directly from `SolarAssessment.annualGenerationKwh` — never
recalculated independently, per this section's original requirement.

### Indicative potential emissions reduction
`annualKgCo2 = round(annualGenerationKwh * gridIntensityGCo2PerKwh / 1000)`.
Uses a caller-supplied grid carbon-intensity figure (e.g. derived from Phase
2 data) when given; otherwise falls back to a labelled default assumption of
150 gCO2/kWh (an approximate recent UK grid average — this figure has fallen
for years as renewables grow, so treat it as a dated reference and verify
against NESO's own published annual average). This calculation assumes all
generated electricity — self-consumed or exported — displaces grid
electricity at that intensity, which holds regardless of self-consumption
rate (unlike the financial calculation below).

### Indicative financial opportunity
Only computed when the caller supplies `electricityPricePencePerKwh` — no
price is ever assumed, since guessing one risks exactly the kind of specific
savings promise `PRODUCT_SPEC.md` forbids. When available:
`indicativeAnnualSavingGBP = annualGenerationKwh * selfConsumptionRate * pricePencePerKwh / 100`.
`selfConsumptionRate` defaults to 35% (no battery) or 65% (with battery) —
rough, overridable approximations, not measured for the specific household —
and the calculation explicitly excludes any export-tariff (e.g. Smart Export
Guarantee) income for the unconsumed remainder.

### Mandatory disclaimer language
Every `SolarScoreResult` includes, verbatim, in both `assumptions` and
`limitations`: *"Estimated and indicative only, based on the information
provided. Actual results depend on installation, tariff, orientation,
shading, consumption and other factors."* — the exact language this
section's original brief required, exported as `SOLAR_SCORE_DISCLAIMER` so
no caller can accidentally omit it.

### Output shape
```
SolarScoreResult {
  formulaVersion, suitability, suitabilitySubScore, annualGenerationKwh,
  generationPerKwp, monthlyGenerationKwh, solarResource, emissionsReduction,
  financialOpportunity, confidence, assumptions[], limitations[],
  dataSources[], calculatedAt
}
```
`confidence` is always `"modelled-estimate"`, carried through from PVGIS.
`limitations` carries over the underlying `SolarAssessment`'s own limitations
array plus the disclaimer above.

## Recommendation priority (Phase 8)
Recommendations are ordered by a deterministic priority function of:
1. Estimated impact category weight (carbon > cost > resilience, configurable)
2. Difficulty (lower difficulty ranks higher at equal impact)
3. Confidence (higher-confidence recommendations rank above speculative ones
   at equal impact/difficulty)

The exact weighting function will be specified in code with unit tests when
Phase 8 is implemented, following the same "expose the reason for the order"
principle as GreenScore.

## What the AI Advisor is allowed to do with these numbers (Phase 7)
The AI receives the *already-computed* `GreenScoreResult`, `SolarAssessment`,
`CarbonIntensityRecord` data and `Recommendation` list as structured context.
It may explain, compare, and prioritise in natural language. It may not
recompute, override, or invent a number that contradicts this file's formulas
— see `PRODUCT_SPEC.md`'s "AI Advisor" rules and the grounding tests planned
for Phase 7 in `TESTING.md`.
