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

## GreenScore (Phase 4)

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

Each component score's own sub-formula is defined when its phase is
implemented (Phase 4), because it depends on the exact shape of upstream data
(e.g. `SolarAssessment` fields from Phase 3) that doesn't exist yet. This
table fixes the **weights** and **inputs** now so later work can't quietly
redefine what GreenScore means.

If a component's required input is entirely missing (e.g. no `SolarAssessment`
exists yet for a property), that component is excluded from the weighted sum
and the weights of the remaining components are renormalised to sum to 100% —
`GreenScoreResult` must record which components were excluded and why, via its
`assumptionsJson` field, so a 74 computed from 5 components is never confused
with a 74 computed from 3.

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
