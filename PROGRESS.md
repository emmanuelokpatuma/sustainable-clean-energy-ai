# Progress

## Current state: Phases 0–3 complete, reviewed, UNVERIFIED by execution

### What was built (Phase 0 — architecture & project setup)
See git history (`Phase 0 review pass` commit) for full detail. Summary:
Next.js 14 + TypeScript scaffold, all 12 DB tables, all 11 required docs,
CI workflow, adapter contract (`DataAdapter`, `AdapterError`, fixture-mode
switch).

### What was built (Phase 1 — postcode / location system)
UK postcode validation, `PostcodesIoAdapter`, `LocationService`,
`POST /api/location/resolve`, location screen, 18 tests. See git history for
full detail.

### What was built (Phase 2 — NESO Carbon Intensity integration)
- `fetchJsonWithRetry` (`src/server/adapters/httpClient.ts`) — a shared HTTP
  helper introduced because this phase's adapter makes three calls per
  `fetch()`: timeout, one retry on network failure or 5xx, no retry on 4xx
  (a bad request won't succeed twice), explicit `rate_limited` classification
  for 429. `PostcodesIoAdapter` (Phase 1) was deliberately left using its own
  simpler inline logic rather than refactored onto this — it already works
  and is tested; nothing working was thrown away to adopt the new pattern.
- `CarbonIntensityAdapter` — calls NESO's `/intensity` (current, **required**),
  `/intensity/{from}/{to}` (forecast, **best-effort**) and `/generation`
  (generation mix, **best-effort**). Current failing fails the whole request;
  forecast or generation-mix failing degrades gracefully to
  `{ available: false, reason }` — current data is still returned, and no
  forecast or generation number is ever invented to fill the gap.
- Closed Zod enum for the NESO `index` label (`very low`…`very high`) — an
  unrecognised future label fails loudly rather than passing through
  un-interpreted.
- `CarbonIntensityService.getEnergyNow()` — same Result-type shape as
  `LocationService`. Deliberately has no location parameter yet: NESO's
  national endpoints are GB-wide, and the regional-by-postcode variant is
  documented as a natural Phase 6+ extension rather than built now (see the
  service's own doc comment and `PRODUCT_SPEC.md`).
- `GET /api/energy/current?forecastHours=N` — **GET, not POST**: this is a
  read of national data with no location body required. `API.md`'s Phase-0
  "planned routes" table had listed this as POST before the route existed;
  API.md now reflects the real, implemented shape.
- Fixtures for `/intensity`, `/intensity/{from}/{to}`, and `/generation`,
  hand-built to the documented schema (network access wasn't available to
  capture live responses — see `tests/fixtures/carbon-intensity/README.md`).
- 6 unit tests (adapter parsing, all error paths, graceful degradation of
  forecast independently of generation mix, retry-on-5xx) + 4 integration
  tests (service-level success, partial degradation, adapter-error mapping,
  unexpected-error mapping).

### What was built (Phase 3 — PVGIS solar integration)
- `PvgisAdapter` — calls PVGIS's `PVcalc` endpoint (v5.2) with a documented,
  configurable `SolarAssumptions` object (3.5 kWp, 35° tilt, south-facing,
  14% loss, `PVGIS-SARAH2` database — a typical small UK residential system,
  **not** the user's actual roof, which V1 doesn't know anything about).
  Every `SolarAssessment` echoes back exactly which assumptions produced it.
- Explicit `limitations` array on every assessment (typical-year data, no
  shading model, assumed roof characteristics, real-world variance) —
  surfaced to the caller, not just implied.
- `annualIrradiationKwhPerM2` is returned as a raw physical quantity, not
  categorised into High/Medium/Low — that categorisation is explicitly
  deferred to SolarScore (Phase 5, per `CALCULATIONS.md`), keeping this
  adapter from quietly taking on a scoring decision that isn't its job.
- Out-of-coverage locations (PVGIS's documented 400 response) surface as a
  distinct `invalid_location` error via the service, not a generic failure —
  and never as a silently-zeroed generation figure.
- `SolarService.getSolarAssessment()` — same Result-type shape as the other
  two services.
- `POST /api/solar/assess` (POST, unlike Energy Now's GET, because a specific
  lat/lon is always required) with Zod validation on both the required
  coordinates and the optional assumption overrides.
- Fixtures: a success response and an out-of-coverage error response, both
  hand-built to PVGIS's documented schema.
- 8 unit tests (adapter parsing, assumption merging, out-of-coverage error
  mapping, retry behaviour) + 5 integration tests (service success,
  invalid-location mapping, unavailable mapping, unexpected-error mapping).

### Review pass performed this session (Phases 2 & 3)
Every file from both phases was read end to end and checked against
`PRODUCT_SPEC.md`, the adapter contract, and the "never fabricate data"
principle. One real (if minor) issue was found and fixed:
- `CarbonIntensityAdapter`'s forecast URL was built with
  `Date#toISOString()`, which includes milliseconds
  (`...T11:30:00.000Z`). NESO's own API documentation uses minute-precision
  timestamps (`...T11:30Z`) with no seconds or milliseconds. Whether the live
  API is lenient about the extra precision was unverified either way — rather
  than rely on that, added a small `toNesoTimestamp()` helper that always
  produces the documented format, plus a unit test asserting the constructed
  URL matches it exactly and contains no millisecond fragment.

Everything else — error classification, graceful degradation, fixture
honesty, doc consistency, no unnecessary dependencies (native `fetch` used
throughout; nothing like `axios` or `node-fetch` was added) — was already
correct. `README.md`'s status line, which still said "Phase 0 + Phase 1"
despite Phases 2–3 already being committed, was updated to match reality.

### What was NOT run, and why
Still no outbound network access in this environment — `npm install`,
`npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` have not
been executed here for Phases 2–3 either. Run them yourself:
```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```
The most likely real-world surprises, flagged honestly rather than guessed
away: (1) whether NESO's live API is actually strict about timestamp
precision (now moot given the fix above, but worth confirming), (2) whether
the hand-built PVGIS fixture's field names (`E_y`, `H(i)_y`, `l_total`) match
the live API exactly, and (3) general dependency version drift.

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- No live verification of any adapter's response shape against the real API
- `DATA_SOURCES.md` "last verified" dates remain honest placeholders
- No database has actually been provisioned/migrated against the schema
- Regional (postcode-specific) carbon intensity — deferred to Phase 6+
- Phases 4–12 (GreenScore, SolarScore, Energy Now UI, AI Advisor, Action
  Plans, auth, security hardening, investor demo, final QA) are not started

### Next recommended phase
Phase 4: the deterministic GreenScore engine. `CALCULATIONS.md` already fixes
the weights and inputs; this phase should implement exactly that spec against
the real `EnergyProfile`, `SolarAssessment` (Phase 3) and `CarbonIntensityRecord`
(Phase 2) shapes now available, with the renormalisation-on-missing-data rule
and extensive boundary-case unit tests `CALCULATIONS.md` calls for.

## Phase 4 — deterministic GreenScore engine

### What was built
- `src/server/calculations/greenScore.ts` — pure, deterministic, no I/O.
  Implements exactly the weights/components fixed in `CALCULATIONS.md`
  (0.25/0.25/0.20/0.15/0.15), plus the concrete sub-formula for each
  component (now written up in `CALCULATIONS.md` itself, replacing its
  Phase-0 placeholder text).
- Missing-data handling: any component whose required input is absent is
  excluded (`included: false, score: null`), and the remaining components'
  weights are renormalised to sum to 1 — verified by a dedicated test that
  checks a single included component ends up with `effectiveWeight` of
  exactly 1, and that its own score alone becomes the total (never dragged
  down by treating excluded components as zero).
- Total-exclusion case: if every component lacks data, `calculateGreenScore`
  returns `{ ok: false, reason: "insufficient_data", message }` instead of a
  fabricated number — the same "never invent, degrade explicitly" pattern
  used by the Phase 2/3 adapters, applied here to a pure calculation instead
  of a network failure.
- `strengths` / `opportunities` arrays generated from component scores
  (≥70 / <40), and an `assumptions` array that always states which
  components were excluded (if any), the "not an official government
  rating" disclaimer, and which benchmark values were used.
- `POST /api/scores/green` — takes the relevant subset of `EnergyProfile`,
  `SolarAssessment`, `CarbonIntensityRecord`-shaped data, and action-plan
  progress directly in the request body (no DB read — persistence is Phase
  9, so this mirrors how `/api/solar/assess` takes lat/lon directly rather
  than a stored property ID). Deliberately has **no service-layer wrapper**,
  unlike the three adapter-backed routes — there's no I/O or
  AdapterError-translation step to justify one; see the route file's own
  comment.
- **A documented, deliberate inconsistency**: Component 2 (renewable
  opportunity) scores available *potential* regardless of whether it's acted
  on, while Component 4 (cleantech opportunity) scores *already-achieved*
  adoption. This mismatch comes from the product brief's own naming and
  `EnergyProfile` not yet tracking "already has solar" — it's called out
  explicitly in `CALCULATIONS.md` rather than papered over, flagged as a
  question for Phase 5/8 to resolve.
- 27 unit tests in `tests/unit/green-score.test.ts` covering every
  component's boundary values, exclusion behaviour, the renormalisation
  invariant, weighted-total arithmetic (hand-verified), strengths/
  opportunities thresholds, and the always-present disclaimer.
- Docs updated: `CALCULATIONS.md` (placeholder → real formulas),
  `ARCHITECTURE.md` (new `src/server/calculations/` layer documented),
  `API.md` (route moved from "planned" to documented with full
  request/response/error shape), `ROADMAP.md`.

### What was NOT run, and why
Same environment constraint as every prior phase: no network access here, so
`npm install`/`npm test`/`npm run typecheck`/`npm run build` have not been
executed. Every boundary case in the 27 new tests was hand-calculated against
the implementation to confirm expected values before being written down (e.g.
the weighted-total test's `87.55 → 88` is arithmetic you can re-check by
hand, not just asserted). Run the usual verification commands yourself:
```bash
npm install && npm run typecheck && npm test && npm run build
```

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- No persistence: `POST /api/scores/green` computes and returns a result but
  never writes a `GreenScore` row — the Prisma model already matches this
  result's shape (from Phase 0), but writing to it needs Phase 9's DB wiring.
- `userProgress` and (indirectly) the full picture this component needs both
  depend on Phase 8 (Action Plans), which doesn't exist yet — every V1 call
  today will have this component excluded.
- The Component 2 / Component 4 "opportunity" definition mismatch noted above
  is flagged, not resolved.
- Reference bands (efficiency benchmarks, irradiation range) are commonly-
  cited approximations, not verified against a specific authoritative source
  — same caveat as every external-data fixture in this project.
- Phases 5–12 (SolarScore, Energy Now UI, AI Advisor, Action Plans, auth,
  security hardening, investor demo, final QA) are not started.

### Next recommended phase
Phase 5: SolarScore. Builds directly on Phase 3's `SolarAssessment` plus
GreenScore's Component 2 scoring approach (the irradiation thresholds
introduced here could reasonably be shared rather than redefined) — see
`CALCULATIONS.md`'s SolarScore section for the categorical suitability
rating and indicative-financial-opportunity rules this phase should implement.

## Phase 5 — SolarScore

### What was built
- `src/server/calculations/mathUtils.ts` — extracted `clamp`, `lerpScore`,
  `levelFor` out of `greenScore.ts` into a shared module, since SolarScore
  needed the exact same three functions. Pure refactor: `greenScore.ts`'s
  behaviour and public exports are unchanged — its existing 27 tests were
  the check that nothing broke, and they still describe the same file.
- `src/server/calculations/solarScore.ts` — pure, no I/O, same discipline as
  GreenScore. Takes a `SolarAssessment` as a **required** input (there's no
  meaningful SolarScore without one, unlike GreenScore's excludable
  components):
  - **Suitability**: `annualGenerationKwh / peakPowerKw`, scored against a
    ~700–1,000 kWh/kWp typical UK reference range. Caught and fixed a real
    design gap while writing this: my first version flatlined every site
    below 700 kWh/kWp at score 40 ("Medium") with no further differentiation
    — an extremely poor site and a mediocre one would have looked identical.
    Added a floor segment below 700 (mirroring the floor GreenScore's
    energy-efficiency component already uses at its own bad end) so poor
    sites keep descending toward "Low" instead of clustering at "Medium".
  - **Estimated annual generation**: passed through from PVGIS unchanged,
    never recalculated — per `PRODUCT_SPEC.md`'s explicit requirement.
  - **Emissions reduction**: `annualGenerationKwh * gridIntensity / 1000`,
    using a supplied grid-intensity figure when given, else a labelled
    default (150 gCO2/kWh — an approximate recent UK average, explicitly
    flagged as a dated reference). Deliberately independent of
    self-consumption rate — exported electricity still displaces grid
    generation elsewhere, so it counts toward emissions reduction even
    though it doesn't count toward the financial saving below.
  - **Financial opportunity**: `{ available: false, reason }` unless the
    caller supplies a real `electricityPricePencePerKwh` — no price is ever
    assumed, since guessing one risks the specific-savings-promise
    `PRODUCT_SPEC.md` explicitly forbids. When available, uses a 35%
    (no battery) or 65% (with battery) self-consumption assumption,
    overridable, and explicitly excludes export-tariff income from the
    figure.
  - **Mandatory disclaimer**: the exact sentence `PRODUCT_SPEC.md` specifies
    ("Estimated and indicative only... Actual results depend on
    installation, tariff, orientation, shading, consumption and other
    factors.") is exported as a constant and included verbatim in both
    `assumptions` and `limitations` on every result, so it can't be silently
    dropped by a caller.
- `POST /api/scores/solar` — takes a `SolarAssessment`-shaped body directly
  (e.g. the output of `/api/solar/assess`) rather than a `:propertyId`, for
  the same reason `/api/scores/green` already deviated from its Phase-0
  "planned routes" placeholder: there's no database-backed property to look
  up yet (Phase 9). No service-layer wrapper, same rationale as
  `/api/scores/green`.
- 19 unit tests: suitability boundaries (including the floor-segment fix
  above), emissions reduction with/without a supplied grid intensity and its
  independence from battery status, all four financial-opportunity paths
  (unavailable/no-price, unavailable/bad-price, default no-battery rate,
  default with-battery rate, explicit override), disclaimer presence in both
  arrays, monthly-generation passthrough, and data-sources accuracy.
- Docs: `CALCULATIONS.md` (placeholder → real formulas, matching the
  GreenScore section's level of detail), `ARCHITECTURE.md` (documents
  `mathUtils.ts` and why it exists), `API.md` (route moved from planned to
  documented, including the illustrative example's numbers hand-verified
  against the actual formula so the docs don't quietly drift from the code),
  `ROADMAP.md`.

### What was NOT run, and why
Same constraint as every prior phase: no network access in this environment,
so `npm install`/`npm test`/`npm run typecheck`/`npm run build` have not been
executed here. Every new test's expected value was hand-calculated against
the formula before being written down (e.g. the financial-opportunity tests'
£343/£637/£490 figures are `3500 × rate × 28 ÷ 100`, checkable by hand), and
the mathUtils refactor was checked by re-reading every call site in
`greenScore.ts` to confirm no behaviour changed. Still, run the real
toolchain yourself:
```bash
npm install && npm run typecheck && npm test && npm run build
```

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- No persistence: `POST /api/scores/solar` computes and returns a result but
  never writes anything to the database (Phase 9).
- The 700–1,000 kWh/kWp suitability range and 150 gCO2/kWh default grid
  intensity are commonly-cited approximations, not verified against a
  specific current authoritative source — same caveat as every other
  assumption in this project.
- No connection yet between GreenScore's Component 2 (renewable opportunity)
  and SolarScore, despite both scoring related things from the same
  `SolarAssessment` — they currently use different reference ranges
  (irradiation-based vs. generation-per-kWp-based) and were kept
  independent rather than unified, to avoid a cross-engine dependency for
  V1. Worth revisiting if the two ever need to agree more precisely.
- Phases 6–12 (Energy Now UI, AI Advisor, Action Plans, auth, security
  hardening, investor demo, final QA) are not started.

### Next recommended phase
Phase 6: Energy Now (UI + interpretation). Builds on Phase 2's
`CarbonIntensityService` — this phase adds the plain-language interpretation
("Electricity is currently relatively low-carbon") and flexible-use timing
suggestion that Phase 2 deliberately deferred, plus the actual dashboard
screen.
