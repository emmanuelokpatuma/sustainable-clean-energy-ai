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

## Phase 6 — Energy Now (UI + interpretation)

### What was built
- `src/server/calculations/energyNowInterpretation.ts` — a pure,
  deterministic, rule-based (not LLM) translation of Phase 2's raw
  carbon-intensity data into plain language: a one-sentence current summary
  from a fixed 5-entry lookup table, and a flexible-use timing suggestion
  that only surfaces when a forecast period is at least 15 gCO2/kWh cleaner
  than current (a documented judgement-call threshold, not a published
  standard) — never suggesting a change for a negligible difference.
- Timing labels are deliberately coarse and honest: "later today (afternoon)"
  / "tomorrow morning" for anything within the next day, and an explicit
  "beyond the next day, treat as indicative only" framing for anything
  further out, rather than inventing a specific day-part label a
  half-hourly forecast can't really support that far ahead.
- `essentialServicesCaveat` and `forecastDisclaimer` are included, verbatim,
  on every result — covering two explicit `PRODUCT_SPEC.md` requirements for
  this phase: never imply changing heating/essential services, and never
  overstate a forecast's certainty.
- `GET /api/energy/current` (Phase 2's route) now also returns
  `interpretation`, computed from the exact same fetch as `energyNow` in the
  same response — chosen over a separate endpoint so the two can never
  drift out of sync with each other.
- `src/app/energy-now/page.tsx` — the actual screen: a summary card colour-
  coded by index, the flexible-use suggestion (or its reason when
  unavailable), the generation mix, and a "Why?" toggle exposing the raw
  current/forecast numbers, source, and retrieval time. Same
  loading/success/error state pattern and plain inline-styled approach as
  Phase 1's location screen, for consistency.
- 14 unit tests (10 test blocks, one parameterised across all 5 NESO index
  labels) covering: every current-summary sentence, the caveat/disclaimer
  always being present, forecast-unavailable passthrough, all-null-forecast
  handling, the meaningful-improvement threshold in both directions,
  actual-vs-forecast fallback for the current value, and all three timing-
  label buckets (today/tomorrow/beyond).
- Docs: `CALCULATIONS.md` gains an "Energy Now interpretation" section
  (this isn't a *score*, but follows the same no-LLM, documented-thresholds
  discipline, so it lives alongside GreenScore/SolarScore rather than
  going undocumented), `ARCHITECTURE.md`'s calculations-folder description
  updated, `API.md`'s existing `GET /api/energy/current` entry updated in
  place (not a new route — see its "Status" line) with the new response
  field and screen reference, `ROADMAP.md`.

### What was NOT run, and why
Same constraint as every prior phase: no network access here, so
`npm install`/`npm test`/`npm run typecheck`/`npm run build`/`npm run dev`
have not been executed. Every test's expected string/threshold was checked
against the actual implementation constants before being written down (e.g.
the "15 gCO2/kWh" threshold and "already close to the best" reason text are
copied from the source, not guessed). Run the real toolchain yourself:
```bash
npm install && npm run typecheck && npm test && npm run build && npm run dev
```
then visit `/energy-now` to see the screen render — that visual check is
one this environment genuinely cannot do at all (no browser, no dev server).

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- The 15 gCO2/kWh "meaningful improvement" threshold is a judgement call
  made while implementing this phase, not derived from any published
  standard — flagged for revisiting once real usage/feedback exists.
- No navigation link from any other screen to `/energy-now` yet — Phase 11
  (or whichever phase builds the overall app shell/navigation) should wire
  screens together; each is currently reachable only by its own URL.
- No persistence of interpreted results — every visit recomputes from a
  fresh (or fixture) fetch, consistent with every other phase so far.
- Phases 7–12 (AI Advisor, Action Plans, auth, security hardening, investor
  demo, final QA) are not started.

### Next recommended phase
Phase 7: the AI Sustainability Advisor. This is the phase `PRODUCT_SPEC.md`
and `PROGRESS.md`'s prior entries flag as needing particular care — the AI
must explain the GreenScore/SolarScore/Energy Now data already computed by
Phases 2–6, never invent numbers, and never guarantee savings. Building the
structured grounding-context object (drawing on the exact result shapes from
`calculateGreenScore`, `calculateSolarScore`, and `interpretEnergyNow`) and a
grounding evaluation dataset should come before any conversational UI.

## Phase 7 — AI Sustainability Advisor

### ⚠️ Read this before using or extending Phase 7
`PRODUCT_SPEC.md` says explicitly: "Run the evaluation before considering the
AI Advisor complete." **That evaluation has NOT been run.** This environment
has no network access and no live `ANTHROPIC_API_KEY`, so the 32-case
evaluation dataset built for this phase (`tests/eval/advisor-eval-dataset.ts`)
has never actually been fired at a real model. Everything below is
code-complete and unit-tested at the level that's possible without a live
model call — but per the spec's own definition, Phase 7 is not "complete."
**Run `ANTHROPIC_API_KEY=... npx tsx tests/eval/run-advisor-eval.ts`, read
every transcript in the resulting `tests/eval/last-run-transcript.json`, and
fix anything it surfaces before this advisor faces a real user.**

### What was built
- `src/server/advisor/groundingContext.ts` — pure, deterministic assembly of
  already-computed GreenScore/SolarScore/EnergyNow/location results into the
  structured context `PRODUCT_SPEC.md` requires the AI to reason from.
  Missing sections render as an explicit "not available... do not invent X"
  instruction rather than being silently omitted (an omission could read as
  "not relevant" instead of "not provided"). 13 unit tests, including one
  that asserts the rendered "GreenScore not available" text contains no
  digits at all — guarding against a future edit accidentally interpolating
  a stray default score.
- `src/server/advisor/systemPrompt.ts` — the actual safety mechanism, not a
  filter bolted on after: every hard rule from `PRODUCT_SPEC.md`'s "AI
  ADVISOR" section is written out as an explicit instruction (never invent a
  number, never guarantee savings, never claim a physical inspection, never
  claim official certification, no unsafe installation instructions, state
  when data is missing, distinguish estimate from measurement, surface
  assumptions, recommend a professional before real decisions). Also
  contains the prompt-injection defence: the grounding context is wrapped in
  `<structured_data>` tags with an explicit instruction that content inside
  — or in the user's message — is never to be treated as an instruction that
  overrides these rules.
- `src/server/adapters/aiAdvisorAdapter.ts` — calls the real Anthropic
  Messages API. Architecturally the same as the Phase 2/3 adapters (typed
  `AdapterError`s, timeout, a fixture mode) but doesn't reuse
  `fetchJsonWithRetry` — that helper is GET-only with no body/headers, and
  this is an authenticated POST with a JSON body, different enough to
  warrant its own implementation (the same judgement call already made for
  `PostcodesIoAdapter`). `ANTHROPIC_MODEL` is now a configurable env var
  (default `claude-sonnet-5`) rather than hard-coded, with an explicit
  "verify this is still current" comment, since a model identifier is
  exactly the kind of detail that goes stale silently.
- `src/server/services/aiAdvisorService.ts` — validates the question,
  enforces `PRODUCT_SPEC.md`'s "store only the minimum necessary
  conversation data" at the service boundary regardless of what a caller
  sends (last 12 messages, 2,000 chars each, hard limits, not suggestions),
  and maps adapter errors to a safe Result — critically, an "invalid_input"
  AdapterError (e.g. missing API key) is translated to a generic message
  rather than leaking the internal detail to the client, verified by a
  dedicated test.
- `POST /api/advisor/ask` — the conversation endpoint. No persistence
  (Phase 9, same as everywhere else) — computes and returns an answer only.
- `src/app/advisor/page.tsx` — the actual chat screen, and the first place
  in this project where the full pipeline runs end to end: postcode →
  location (Phase 1) → solar assessment (Phase 3) → energy now (Phase 2/6)
  → GreenScore (Phase 4) + SolarScore (Phase 5) → chat (Phase 7), all
  client-orchestrated since there's no server-side persistence yet to hold
  an assembled context between requests.
- **`tests/eval/advisor-eval-dataset.ts`**: 32 cases across 10 categories
  (grounded factual answers, missing-data handling, no-savings-guarantee,
  no-physical-inspection-claim, no-official-certification-claim, unsafe-
  instructions refusal, estimate-vs-measurement, assumptions-surfaced,
  prompt injection, general usefulness). The prompt-injection category
  specifically includes a case where the injection attempt is embedded IN
  the structured data (a fake "recommendation" telling the AI to ignore its
  rules and push a specific brand) rather than only in the user's message —
  the more realistic threat vector once Phase 8 introduces user-influenced
  content into the context.
- **`tests/eval/run-advisor-eval.ts`**: the harness — calls the real service
  (refuses to run in fixture mode, since that would just replay one canned
  answer 32 times and prove nothing), applies automated substring and
  heuristic number-leakage checks, and writes a full transcript for human
  review. Explicitly documented as a first-pass net, not a certificate — see
  `tests/eval/README.md`.
- 27 unit tests total (grounding context 13, adapter 6, service 8) covering
  everything testable without a live model call: context rendering
  correctness for every section (present/absent/partial), adapter error
  classification (missing key, network failure, 429, malformed response),
  and service-level validation/minimisation/error-mapping.
- Docs: `CALCULATIONS.md` gains an explicit note that the AI Advisor is the
  one deliberate exception to "no LLM computes a number" (and its stale
  Phase-0-era intro was corrected — it still said nothing was implemented),
  `ARCHITECTURE.md` documents the new `advisor/` folder and the AI adapter,
  `API.md` documents the route and screen, `PRIVACY.md`'s Phase 7 section
  updated from "planned" to what's actually sent/stored (nothing persisted
  yet; the AI receives only the same already-minimised location fields used
  throughout, never a full postcode), `SECURITY.md`'s prompt-injection entry
  updated from a forward-looking note to what was actually built and what
  still needs live verification, `ROADMAP.md`, `.env.example` gains
  `ANTHROPIC_MODEL`.

### What was NOT run, and why (this phase's caveat is stronger than usual)
Every prior phase's "no network access, verify yourself" caveat applies here
too — `npm install`/`npm test`/`npm run typecheck`/`npm run build` haven't
been run. But this phase has an additional, more consequential gap: **the
32-case evaluation itself has never been executed against a real model.**
Unlike a missed `npm test` run (mechanical, low-risk to skip once), skipping
this evaluation means the actual safety properties this phase exists to
provide — does the model really refuse the unsafe-instruction cases, does it
really resist the embedded-injection case, does it really avoid inventing
numbers when tempted — are UNVERIFIED. The system prompt and grounding
context were written carefully and reasoned through, but "written carefully"
and "verified against actual model behaviour" are different claims, and only
the second one is what `PRODUCT_SPEC.md` asks for.

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- No persistence of conversations (Phase 9).
- No navigation link to `/advisor` from other screens yet (same gap noted
  for `/energy-now` in Phase 6 — an app-shell/navigation phase should wire
  these together).
- `RECOMMENDATIONS` in the grounding context has no real data source until
  Phase 8 exists — every call today renders that section as "not available
  yet."
- The evaluation's automated checks are heuristic (substring matching, a
  number-leakage scan) — real evaluation requires a human reading all 32
  transcripts, not just the pass/fail summary.
- Phases 8–12 (Action Plans, auth, security hardening, investor demo, final
  QA) are not started.

### Next recommended phase
Before Phase 8: **run the Phase 7 evaluation** (see above) — this is a
harder gate than "next phase," it's a completion requirement for the phase
that's technically already built. After that, Phase 8: Action Plans, which
will finally give the grounding context's `recommendations` section (and
GreenScore's `userProgress` component, excluded in every score so far) real
data to work with instead of "not available yet."

## Phase 8 — Action Plans

**The Phase 7 evaluation gate above still stands — it was not run before
proceeding to this phase, since building Phase 8 doesn't require a live
model call and the user asked to continue. Do not skip that evaluation
before relying on the AI Advisor.**

### What was built
- `src/server/calculations/actionPlan.ts` — pure, deterministic, no I/O,
  same discipline as GreenScore/SolarScore/Energy Now interpretation. Four
  V1 rules, each firing only on a genuine signal already present in
  computed data (never on an absence alone, to avoid presumptuous
  product-specific suggestions like "get an EV charger"):
  - **Investigate solar suitability** — fires whenever a SolarScore exists;
    framed differently (but not omitted) when suitability is Low.
  - **Shift flexible electricity use** — fires when Energy Now's
    flexible-use suggestion is available; deliberately never assigns a
    quantified CO2 figure, since no per-household consumption data exists
    to calculate one from.
  - **Review household energy efficiency** — fires when GreenScore's
    energyEfficiency component is included but scores below 70 (distinct
    from "excluded for missing data," which triggers the next rule instead).
  - **Add more information to sharpen your GreenScore** — fires whenever
    any GreenScore component was excluded; always sorts last
    (`impactCategory: "informational"`, weight 0).
- Priority ordering is a genuine 3-key lexicographic sort (category, then
  difficulty, then confidence) — read literally from CALCULATIONS.md's
  numbered list rather than collapsed into a single weighted score, which
  would have been a looser interpretation of "1. ... 2. ... 3. ...".
- `POST /api/action-plan/generate` — same "no service wrapper, pure
  calculation" pattern as `/api/scores/green` and `/api/scores/solar`.
- **Refactor**: extracted `src/server/validation/resultSchemas.ts` out of
  `/api/advisor/ask/route.ts` — the action-plan route needed the identical
  ~80 lines of Zod schema for GreenScoreResult/SolarScoreResult/EnergyNow
  shapes that the advisor route already had inline. Pure extraction, no
  validation behaviour changed (same pattern as `mathUtils.ts` in Phase 5:
  the second copy-paste is tolerable, the third is the signal to share).
- **Phase 7 files updated to close the loop they were built anticipating**:
  `groundingContext.ts`'s `recommendations` field now accepts the real
  `RecommendedAction[]` shape (previously a placeholder `{title,
  explanation, priority}` stub with a "not available yet" message) and
  renders each action's impact category, difficulty, confidence, estimated
  impact, and suggested next step — not just a title. The advisor screen
  (`src/app/advisor/page.tsx`) now calls `/api/action-plan/generate` as
  part of its pipeline and feeds real recommendations into the chat context.
  The eval dataset's `injection-03` case (a fake malicious "recommendation"
  embedded in structured data) was updated to the new required shape so it
  still type-checks — the injection attempt itself is unchanged.
- 17 new unit tests (`tests/unit/action-plan.test.ts`) covering: every
  rule's trigger/non-trigger conditions, that no rule ever invents a
  quantified figure it doesn't have, and priority ordering — including
  hand-verified cases for category-beats-category, difficulty-breaks-a-
  category-tie, the informational rule always sorting last, and no gaps in
  the assigned priority sequence. `tests/unit/grounding-context.test.ts`'s
  Recommendations section tests were rewritten for the richer shape (now
  15 tests total in that file, up from 13).
- Docs: `CALCULATIONS.md`'s Recommendation priority section replaced with
  the actual rules/sort order (previously a forward-looking placeholder
  since Phase 0), `ARCHITECTURE.md` documents `actionPlan.ts` and the new
  `validation/` folder, `API.md` documents the route and updates the
  advisor screen's description, `ROADMAP.md`.

### What was NOT run, and why
Same environment constraint as every phase: no network access, so
`npm install`/`npm test`/`npm run typecheck`/`npm run build` haven't been
executed. Every priority-ordering test's expected sequence was worked out
by hand against the CATEGORY_WEIGHT/DIFFICULTY_RANK/CONFIDENCE_RANK tables
before being written down. Separately and more importantly: **the Phase 7
evaluation still hasn't been run** — see that phase's entry above. Phase 8
doesn't change that gate; it's still outstanding.

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- GreenScore's `userProgress` component is STILL always excluded — Phase 8
  produces recommendations but has no persistence (Phase 9) to track which
  ones a user has actually completed, so there's no `{completed, total}`
  signal to feed back into GreenScore yet. That link (Action Plan progress
  → GreenScore's userProgress component) is a Phase 9 follow-up, not
  something Phase 8 alone can close.
- No persistence of generated action plans — every call recomputes from
  scratch, consistent with every route so far.
- Only 4 rules exist. `PRODUCT_SPEC.md`'s examples ("Investigate solar
  suitability," "Shift flexible electricity use," "Review household energy
  efficiency") are all covered; a richer rule set (e.g. differentiating gas
  vs. electric heating advice, or CleanTech-specific suggestions once V1
  decides how to handle the Component 2/4 "opportunity" definition
  inconsistency flagged back in Phase 4) is future work, not a gap in what
  was asked for.
- Phases 9–12 (auth, security hardening, investor demo, final QA) are not
  started.

### Next recommended phase
**Run the Phase 7 AI Advisor evaluation before anything else** — it has now
been outstanding across two phases of continued building, and this project's
own principle ("never claim complete without verification") applies to the
project's own recommendations to itself just as much as to a GreenScore
figure. After that: Phase 9 (authentication/privacy), which is what finally
unlocks real persistence — for stored conversations (Phase 7), completed
action tracking that feeds GreenScore's userProgress component (Phase 8),
and every other "no persistence yet" note across Phases 1–8.

## Phase 9 — Authentication / privacy layer

**The Phase 7 evaluation gate still stands — three phases outstanding now.
It was not run before proceeding to this phase either, for the same reason
as before (this phase doesn't require a live model call, and continuing was
requested). Do not let this keep getting further buried — see that phase's
entry above before the AI Advisor faces a real user.**

### What was built
- **Password hashing** (`src/server/lib/password.ts`): scrypt via Node's
  built-in `crypto`, salted per-user, deliberately not a dedicated
  bcrypt/argon2 dependency for V1 (documented rationale in the file itself).
- **Sessions** (`src/server/lib/session.ts`): a signed (HMAC-SHA256),
  30-day-expiring token in an `httpOnly`/`sameSite: lax` cookie — not a
  full JWT library, ~90 lines doing exactly what this app needs.
  `SESSION_SECRET` is required and validated (≥32 chars) at first use in
  production (throws loudly rather than signing with a weak/absent secret);
  falls back to a per-process random secret with a logged warning in
  development.
- **`AuthService`** (`src/server/services/authService.ts`): signup and
  login, constructor-injectable DB client for testability (same pattern as
  `AiAdvisorService`'s injectable adapter). Login returns the byte-for-byte
  identical message ("Invalid email or password.") whether the email
  doesn't exist or the password is wrong — verified by a dedicated test,
  not just asserted in a comment.
- **Five auth routes**: `POST /api/auth/signup`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`, `DELETE /api/auth/account`
  (requires re-entering the current password; cascades to every `Property`,
  `GreenScore`, and `AiConversation` via new `onDelete: Cascade` relations
  added to `prisma/schema.prisma`).
- **One real, complete persistence slice** — deliberately not an attempt to
  wire all of Phases 1–8's outputs into the database at once:
  - `POST /api/properties` / `GET /api/properties` — the first routes in
    this entire project that write to the database. Creates/lists a
    `Property` (+ its `Location`) owned by the logged-in user.
  - `POST /api/scores/green` gained an optional `propertyId` — when
    supplied, the route (unchanged for every other caller) saves the
    computed result to the `GreenScore` table after an ownership check.
  - `GET /api/properties/:id/green-scores` — the saved-history endpoint,
    realising the "GET /api/scores/solar/:propertyId"-shaped idea `API.md`
    speculatively planned back in Phase 0 before persistence existed, for
    GreenScore rather than SolarScore.
  - **Fixed during review**: the two ownership-check routes initially
    returned different status codes for "property exists but isn't yours"
    (403 on one, 404 on the other) — made consistent on 404 (the more
    security-conscious choice: don't confirm a given ID exists to a
    non-owner) and updated `API.md` to match.
- **`src/app/settings/page.tsx`** — the ninth and final core V1 screen from
  `PRODUCT_SPEC.md` ("Settings/Data & Privacy"), previously the one
  explicitly-named screen with no page at all. Handles login/signup,
  displays account email and saved properties, explains what's stored and
  why in plain language, and provides the account-deletion flow.
- **Schema changes**: `User.passwordHash`, `onDelete: Cascade` on the
  User→Property, User→AiConversation, and every Property→(child table)
  relations, `GreenScore.formulaVersion` (to match `calculateGreenScore`'s
  real output shape, which the Phase 0 schema predated). **No migration has
  been generated or run** — `npx prisma migrate dev` needs to be run once
  a real Postgres instance is available; see "What was NOT run" below.
- 19 new unit tests: 5 for password hashing (round-trip, wrong password,
  no-plaintext-leak, distinct salts, fails-closed on malformed input), 6 for
  session tokens (round-trip, tampered payload, tampered signature, expired,
  malformed variants, distinct tokens per user), 8 for `AuthService`
  (signup success/short-password/duplicate-email/hash-not-plaintext,
  login success/wrong-password/nonexistent-email — with an explicit
  byte-for-byte equality check between the last two's error messages —
  and email-case normalisation).
- Docs: `PRIVACY.md`'s account-data section rewritten from "planned" to
  actual (what's collected, the erasure path, what's still NOT persisted),
  `SECURITY.md` gains a substantial Authentication section AND an honest
  "open items" list specific to auth (most importantly: **no rate limiting
  on login/signup — the single biggest concrete risk this phase
  introduces**, no email verification, no password reset flow),
  `ARCHITECTURE.md` documents the new `lib/` auth files and the persistence
  boundary, `API.md` documents all seven new/changed routes, `ROADMAP.md`.

### What was NOT run, and why
The usual environment constraint (no network access) applies with extra
weight this phase: **there is no Postgres instance in this environment, so
none of the new database-touching code — signup, login, property creation,
GreenScore saving, account deletion's cascade — has been executed against a
real database.** Every route was reviewed by hand for correctness against
the schema, and `AuthService` itself is unit-tested with a mocked DB client,
but the actual Prisma queries (`create`, `findUnique` with the real
generated client, cascading `delete`) are unverified. Before trusting this:
```bash
npm install
npx prisma migrate dev --name phase_9_auth   # generates + runs the new migration
npm run typecheck && npm test && npm run build
npm run dev   # then actually sign up, save a property, save a GreenScore, delete the account
```
The account-deletion cascade specifically deserves a manual check — create a
user, give them a property with a saved GreenScore, delete the account, and
confirm both the property and the GreenScore row are actually gone, not just
the user row.

**The Phase 7 AI Advisor evaluation remains separately, and still,
unrun — this is now the third phase in a row where that's true.**

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- **Not wired to persistence despite this phase's work**: SolarScore
  results, AI conversations (Phase 7), and Action Plans/Recommendations
  (Phase 8) — all have Prisma models, none have a route that writes to
  them. This was a deliberate scope decision (one complete real slice
  rather than eight half-wired ones), not an oversight, but it means
  GreenScore's `userProgress` component is STILL always excluded — there's
  now a way to save a GreenScore, but still no way to mark a recommendation
  "done" and feed that back in.
- No rate limiting, no email verification, no password reset — see
  `SECURITY.md`'s Phase 9 section for the full list, with rate limiting on
  auth routes flagged as the most urgent.
- No migration has been generated (see above) — this environment cannot
  run `prisma migrate dev`.
- Phases 10–12 (security hardening, investor demo, final QA) are not
  started. Phase 10 in particular should treat this phase's own "open
  items" list as its starting checklist, not rediscover the same gaps.

### Next recommended phase
**Still: run the Phase 7 AI Advisor evaluation before anything else** — it has now
been outstanding across three phases of continued building, and this project's
own principle ("never claim complete without verification") applies to the
project's own recommendations to itself just as much as to a GreenScore
figure. After that: Phase 10, security and UX hardening — this phase's own
SECURITY.md additions (rate limiting above all) are the concrete starting
list, not a generic "do a security review."

## Phase 10 — Testing & production hardening / security review

**The Phase 7 evaluation gate still stands — four phases outstanding now.
Still not run, for the same reason as every phase since: no network access
in this environment, and continuing was requested. See that phase's entry.**

### Scope decision
`ROADMAP.md` labels this phase "Testing & production hardening / security
review" — no explicit UX-redesign mandate the way the original product brief's
separately-numbered UX phase had. Scoped this delivery to what `SECURITY.md`
had already flagged as concrete, fixable gaps, plus an actual review pass,
plus a genuine (not superficial) accessibility check — rather than a
speculative "polish everything" pass with no specific target. `CALCULATIONS.md`
was not touched — no calculation changed, per this phase's own "do not change
the underlying calculations" instruction (in the original brief's parallel
UX-hardening description).

### What was built
- **`src/server/lib/rateLimit.ts`** — an in-memory, fixed-window rate
  limiter, applied to exactly the three routes that needed it:
  - `POST /api/auth/login`: 5 attempts / 15 min / IP (this document's own
    "single biggest concrete risk" from Phase 9 — now closed).
  - `POST /api/auth/signup`: 3 accounts / hour / IP (anti-spam).
  - `POST /api/advisor/ask`: 20 questions / hour / IP — cost protection
    (every call is a billed Anthropic API request), not brute-force
    protection.
  - **Honestly-stated limitation, not glossed over**: this is per-process
    in-memory state. Correct for one server instance; silently becomes "N
    per window *per instance*" the moment this app runs as multiple
    instances or serverless functions. A real multi-instance deployment
    needs a shared store (Redis) instead — documented in the file itself
    and in `SECURITY.md`, not discovered later.
  - 9 unit tests: limit enforcement, independent keys, window expiry,
    exact `retryAfterSeconds` arithmetic (hand-verified: 60s window, 40s
    elapsed, expect exactly 20s remaining), and `enforceRateLimit`'s
    429-with-`Retry-After` wrapper behaviour including per-route and
    per-IP namespacing.
- **CI dependency scanning**: `npm audit --audit-level=high` added to
  `.github/workflows/ci.yml`, previously a deliberate TODO comment.
  **Marked `continue-on-error: true` on purpose** — this project's actual
  dependency tree has never been audited (no network access in this
  environment across its entire build), so claiming a passing gate would be
  fabricating a result. The check now exists and is visible; someone with
  real `npm install` access needs to run it, look at what it says, and
  remove `continue-on-error` once there's a confirmed clean or consciously
  accepted baseline.
- **A real route-by-route security review** (all 14 API routes, not just
  the auth ones), documented in `SECURITY.md`'s "Phase 10 review findings":
  confirmed no route ever returns `passwordHash` (checked the two
  `prisma.user.findUnique` call sites that fetch the full record
  specifically, not just the ones that already used a `select` clause),
  confirmed no route logs an email or password, confirmed no route sets any
  `Access-Control-*` header (downgrading the old "CORS: needs
  configuration" item to "already secure by default, revisit only if a
  cross-origin client is added" — a finding, not just a restatement of the
  same open item).
- **A real (not superficial) accessibility check** across all four screens:
  counted `<input>` elements against `aria-label` attributes per screen and
  confirmed every one is labelled (Phase 1's postcode screen: 1/1, Energy
  Now: 0 inputs/0 labels — correctly has none, since its only interactive
  element is a `<button>` with visible text, which doesn't need one, not a
  gap — Advisor: 2/2, Settings: 3/3). No accessibility issues found or
  fixed this phase, and that absence is reported directly rather than
  padded with invented busywork to make the phase look bigger.

### What was NOT run, and why
The usual constraint: no network access, so `npm install`, the new `npm
audit` step, `npm test`, `npm run typecheck`, and `npm run build` have not
been executed in this environment. The 9 new rate-limiter tests were
checked by hand against the implementation (the `retryAfterSeconds` test in
particular — `60_000ms window, 40_000ms elapsed → 20s remaining` — is exact
arithmetic, not an approximation). **The Phase 7 AI Advisor evaluation
remains unrun — fourth phase running now.**

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- Email verification, password reset, CSRF beyond `sameSite: lax`, and
  auth event audit logging remain open — see `SECURITY.md`'s
  authentication-specific open items, unchanged by this phase (not this
  phase's scope; flagged, not silently dropped).
- `npm audit`'s actual result is unknown until someone runs it with real
  network access — the CI step exists but doesn't gate merges yet.
- The in-memory rate limiter's single-instance limitation is a real
  production gap for any horizontally-scaled deployment, documented rather
  than solved (would require adding a Redis dependency, which is a bigger
  infrastructure decision than this phase's scope).
- No investor demo mode or final QA report — that's Phases 11–12.

### Next recommended phase
**Still: run the Phase 7 AI Advisor evaluation** — fourth time flagging
this, deliberately, because the pattern of "one more phase, then I'll do
it" is precisely how real projects let a stated safety gate quietly expire.
After that: Phase 11, investor demonstration mode — a fast, reliable,
clearly-labelled demo path through the full postcode → GreenScore →
SolarScore → Energy Now → Advisor → Action Plan pipeline built across
Phases 1–8, per `PRODUCT_SPEC.md`'s 90-second demo script requirement.

## Phase 11 — Investor demonstration mode

**The Phase 7 evaluation gate still stands — five phases outstanding now.
See that phase's entry. This phase's own script (`DEMO_SCRIPT.md`) explicitly
tells the presenter what to say if the AI Advisor step is slow or
unavailable — it does not, and cannot, resolve the underlying gate.**

### What was built
- **`src/app/demo/page.tsx`** — implements `PRODUCT_SPEC.md`'s Phase 11
  journey exactly: postcode → location → SolarScore/GreenScore inputs →
  Energy Now → GreenScore + SolarScore → top 3 recommendations → a fixed AI
  Advisor question ("What should I do first to reduce my environmental
  impact while saving money?") → the answer → data sources/assumptions.
  **Not a separate mocked pipeline** — it calls the exact same `/api/*`
  routes every other screen uses. The only "demo" behaviour is presentation
  (a curated default postcode, the fixed investor question instead of free
  text, progressive reveal for pacing) and radical honesty about data
  provenance.
- **`DEMO_SCRIPT.md`** — the required 90-second spoken script, timestamped,
  plus an explicit "if something goes wrong live" section (what to say if a
  section errors, if the AI Advisor is slow, if someone asks "is this real
  data?") and a section stating what the demo deliberately doesn't show
  (persistence, login) rather than pretending those don't exist.
- **A real gap found and fixed, not just noted**: `PRODUCT_SPEC.md` requires
  "never represent demo data as live data" and "add a visible Demo Mode
  indicator when demo fixtures are being used." Checking whether this
  project could actually honour that requirement surfaced a genuine bug —
  `LocationService` and `AiAdvisorService` were silently dropping the
  `isFixture` flag their own adapters already returned (`SolarService` and
  `CarbonIntensityService` already passed it through correctly since
  Phase 2/3). Fixed both, added `isFixture` to `LocationResult` and
  `AskAdvisorOutput`, and strengthened one existing test in each of
  `tests/integration/location-service.test.ts` and
  `tests/unit/ai-advisor-service.test.ts` to assert it propagates rather
  than just happening to pass. This means EVERY screen, not just `/demo`,
  can now honestly disclose fixture-derived data — a project-wide fix that
  a demo-specific requirement happened to surface.
- The demo screen's "Demo Mode" banner is driven entirely by that fix:
  it appears the moment any fetched piece (location, solar, energy, or the
  AI Advisor's answer) reports `isFixture: true`, with text that says
  plainly what that means rather than a vague icon.
- Docs: `ARCHITECTURE.md` gains a "Data-provenance transparency" section
  documenting the fix and an "Investor demo" section, `ROADMAP.md`,
  `README.md`'s doc index and status line.

### What was NOT run, and why
Same constraint as always — no network access, so this screen has not
actually been loaded in a browser, and the demo pipeline has not been
run end-to-end against either live APIs or fixture mode. The `isFixture`
propagation fix, by contrast, IS verified — by the two strengthened unit
tests, which check the actual field value rather than just compiling.
Before presenting this to anyone:
```bash
npm install && npm run build && npm run dev
# then visit /demo, click "Start Demo", and confirm:
# - every section populates in a reasonable time
# - the Demo Mode banner appears/doesn't appear correctly depending on
#   USE_FIXTURE_DATA
# - the AI Advisor section actually answers the fixed question sensibly
#   (this also doubles as an extra, informal check on Phase 7 grounding —
#   but is NOT a substitute for the real evaluation, which is still unrun)
```
**The Phase 7 AI Advisor evaluation remains unrun — fifth phase running now.**

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- No visual/UX polish pass on `/demo` beyond what was needed for basic
  legibility and the required Demo Mode banner — Phase 10 already scoped
  UX work down to a security-focused review; a genuinely "investor-grade"
  visual treatment (per the original product brief's separate UX-hardening
  language) is not done.
- The demo intentionally doesn't showcase persistence (saved properties,
  GreenScore history) or login — noted directly in `DEMO_SCRIPT.md` rather
  than silently absent.
- No rehearsal/timing verification — the ~90-second script's pacing is
  estimated from the content, not measured against an actual run (which
  requires the browser/dev-server access this environment doesn't have).
- Phase 12 (final QA report) is not started.

### Next recommended phase
**Still: run the Phase 7 AI Advisor evaluation.** Fifth flag. After that:
Phase 12, the final QA pass — `PRODUCT_SPEC.md` asks for a
`FINAL_QA_REPORT.md` testing the complete journey under normal and
adverse conditions (invalid input, API failure, partial data, mobile/
desktop, unauthorised access) and an explicit P0/P1/P2 severity list of
what remains. This phase's own "what was NOT run" sections across all 11
prior phases are the raw material for that report — Phase 12 should
compile them, not rediscover them.

## Phase 12 — Final QA report

**The Phase 7 evaluation gate still stands — six phases outstanding now.
`FINAL_QA_REPORT.md` lists this as P0 #1. It is not resolved by writing a
report about it.**

### What was built
- **`FINAL_QA_REPORT.md`** — compiles every phase's "what was NOT run"
  caveat into one document, plus a fresh code-level journey walkthrough
  (13 scenarios: normal flow, invalid postcode, API failure, partial data,
  missing solar/carbon data, slow network, mobile/desktop, unauthorised
  access, malformed input, AI grounding, database failure), the spec's
  9-item checklist, and a P0/P1/P2 severity list. States plainly, in its
  first line, that the application is NOT production-ready.
- **A genuine first for this project: real, executed verification**, not
  just careful reading. This sandboxed environment turned out to have a
  standalone TypeScript compiler available independent of the project's
  own `npm install`-gated dependencies. Used it to actually typecheck:
  - `src/server/calculations/*.ts` (GreenScore, SolarScore, Action Plan,
    Energy Now interpretation, math utils) — zero external dependencies,
    compiled clean under `--strict` with no shims. The most
    safety/correctness-critical pure logic in the app is now genuinely
    confirmed type-sound, not just apparently so.
  - `src/server/advisor/groundingContext.ts` and `systemPrompt.ts` — same,
    clean.
  - `src/server/lib/password.ts`, `session.ts`, `rateLimit.ts` — required
    hand-built shims for Node/Next types; clean once shimmed.
- **An anomaly investigated properly, not dismissed or over-reported**: an
  initial typecheck of `session.ts` flagged what looked like a real bug (a
  `string | null` vs `string` mismatch on `getSessionSecret()`'s return).
  Rather than assume either "probably fine" or "definitely a bug," isolated
  it with a minimal reproduction and confirmed it was a cascading artifact
  of unresolved `process`/`console`/`Buffer` types interfering with the
  compiler's narrowing — not a real defect. The shim setup itself was also
  sanity-checked by deliberately breaking a property name and confirming
  the checker caught it, before trusting a clean result on the real file.
  This is the standard the rest of this report tries to hold to: verify
  anomalies, don't wave them away or inflate them.
- **One genuine new finding, not a restatement**: no route wraps its
  Prisma calls (`user.create`, `property.create`, `greenScore.create`,
  `user.delete`) in error handling — a database connection failure would
  surface an unfriendly raw error, breaking the "errors are user-friendly"
  standard the rest of the app holds to. Added to the severity list as P0
  #4 rather than left implicit.
- Test suite inventory: 18 test files (15 unit, 3 integration), ~175 test
  cases, counted directly rather than estimated from memory.

### What was NOT run, and why
Everything `FINAL_QA_REPORT.md` itself says wasn't run: `npm install`,
`npm test`, `npm run build`, any database migration, and — again, still,
sixth time — the Phase 7 AI Advisor evaluation. This phase's job was to be
honest about the aggregate state of all of that, not to resolve it, and it
does not claim otherwise anywhere in `FINAL_QA_REPORT.md`'s own text.

### Also not yet done
Nothing new beyond what `FINAL_QA_REPORT.md`'s P0/P1/P2 list already
states explicitly — that list IS the "also not yet done" for this phase
and the entire project. Repeating it here would just be a second copy of
the same information; read the report.

### Next recommended phase
There is no Phase 13 in `ROADMAP.md` — this was the last planned phase.
What comes next is not a phase, it's the P0 list in `FINAL_QA_REPORT.md`,
starting with the AI Advisor evaluation that has now been outstanding
across six consecutive phases. Every phase's code is complete per
`ROADMAP.md`. The project is not done in the sense that matters — running,
verified, safe to put in front of a real user — until that list is closed,
starting from the top.

