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

## SolarScore (Phase 5)
Built directly from `SolarAssessment` (Phase 3, PVGIS-derived):
- **Solar suitability**: categorical (High/Medium/Low), derived from modelled
  annual generation per kWp for the location relative to UK-wide typical
  ranges — exact thresholds to be set from real PVGIS output ranges when
  Phase 3/5 are implemented, not guessed now.
- **Estimated annual PV generation**: taken directly from PVGIS, never
  recalculated independently.
- **Indicative financial opportunity**: only computed when sufficient inputs
  exist (a plausible electricity price assumption, explicitly labelled as an
  assumption); otherwise omitted rather than guessed.
- Every SolarScore output carries `confidence` and `assumptionsJson` fields
  (already in the Phase 0 schema — see `prisma/schema.prisma`).

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
