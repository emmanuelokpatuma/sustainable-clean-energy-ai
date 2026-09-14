# Testing Strategy

## Principles
- Unit tests never hit the network.
- Integration tests exercise a full service flow (e.g. "postcode in → location out")
  against **recorded fixtures** by default, so `npm test` is deterministic and
  works offline / in CI.
- A small, explicitly-marked subset of tests may call live APIs when run with
  `LIVE_API_TESTS=true npm test` — never in default CI runs.
- Never weaken or delete a test to make a build pass. If a test is wrong, fix the
  test deliberately and say so in the commit message.

## Fixture policy
Fixtures live in `tests/fixtures/<adapter-name>/`. Each fixture file is a real,
representative recorded response (or a hand-built one that matches the documented
schema when a live example wasn't available at scaffold time) with a comment
noting its origin and date.

## Current coverage (Phase 0/1/2)
- `tests/unit/postcode-validation.test.ts` — UK postcode format validation
- `tests/unit/postcodes-io-adapter.test.ts` — adapter parsing, fixture-mode
- `tests/integration/location-service.test.ts` — full resolve flow incl. failure paths
- `tests/unit/carbon-intensity-adapter.test.ts` — response parsing, fixture-mode,
  required-vs-best-effort call failures, retry-on-5xx behaviour
- `tests/integration/carbon-intensity-service.test.ts` — full Energy Now data
  flow incl. partial degradation (forecast/generation-mix unavailable) and
  total failure paths

## Coverage still required (later phases)
- PVGIS parsing + SolarAssessment normalisation
- GreenScore boundary cases (missing data, all-zero, all-max)
- Recommendation prioritisation ordering
- AI context construction (grounding — no invented numbers)
- AI Advisor evaluation dataset (≥30 questions) — see Phase 7 in ROADMAP.md
