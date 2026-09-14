# Progress

## Current state: Phase 0 + Phase 1 complete, reviewed, UNVERIFIED by execution

### What was built (Phase 0 — architecture & project setup)
- Next.js 14 + TypeScript project structure (`src/app`, `src/server/{adapters,services,lib,db}`)
- `package.json` with a minimal, justified dependency set (Next, React, Prisma,
  Zod, Vitest) — no unused libraries (an initially-listed `msw` dependency was
  removed on review since the tests use Vitest's built-in `vi.stubGlobal` for
  fetch mocking and never imported MSW)
- `tsconfig.json`, `vitest.config.ts`, `next.config.js`, `.eslintrc.json`, `.env.example`
- `.github/workflows/ci.yml` — typecheck, lint, test (fixtures only, no live
  network/DB dependency), build. `npm audit` is a deliberately visible TODO,
  not silently skipped — see `SECURITY.md`.
- Prisma schema (`prisma/schema.prisma`) with all 12 V1 tables: users, properties,
  locations, energy_profiles, solar_assessments, carbon_intensity_records,
  green_scores, recommendations, action_plans, ai_conversations, data_sources,
  source_refresh_logs
- Shared adapter contract (`src/server/adapters/types.ts`) with typed `AdapterError`
  and a fixture-mode switch (`USE_FIXTURE_DATA`)
- Env validation (`src/server/lib/env.ts`), structured logger, Prisma client singleton
- Docs: README, ARCHITECTURE.md, PRODUCT_SPEC.md, DATA_SOURCES.md, ROADMAP.md,
  TESTING.md, and — added on this review pass — **SECURITY.md, PRIVACY.md,
  CALCULATIONS.md, API.md** (all 11 docs required by the spec now exist).
  CALCULATIONS.md fixes the GreenScore weights/inputs and SolarScore/
  recommendation approach *before* Phase 4/5/8 implement them, so those
  phases build to a spec instead of inventing one on the day.

### What was built (Phase 1 — postcode / location system)
- UK postcode format validation + normalization (`src/server/lib/postcode.ts`)
- `PostcodesIoAdapter` — real adapter implementation with a 5s timeout, 404
  handling, Zod-validated response parsing, and a fixture mode
- `LocationService` — the reusable service future solar/energy phases will consume
- `POST /api/location/resolve` route handler (server-only; documented in `API.md`)
- Location/Postcode screen with loading, success and error states
- Fixtures: a schema-accurate Postcodes.io response for SW1A 1AA (a real,
  documented example postcode; values are schema-accurate but hand-built, not
  a live capture — noted in `tests/fixtures/postcodes-io/README.md`), plus a
  not-found fixture
- Tests: postcode validation (unit, 9 cases), adapter parsing + all three
  error paths (unit, 4 cases), full service flow including invalid/not-found/
  unavailable/unexpected-error paths (integration, 5 cases) — 18 test cases total

### Review pass performed this session
Every file was read and checked for: correctness against the spec, consistency
between docs and code, no unnecessary dependencies, and no missing Phase-0
deliverables. Findings and fixes:
- Removed the unused `msw` dependency (see above).
- Added the four missing required docs (SECURITY.md, PRIVACY.md,
  CALCULATIONS.md, API.md).
- Added `next.config.js` and `.eslintrc.json`, without which `npm run build`
  and `npm run lint` would fail.
- Added `.github/workflows/ci.yml`, which the original scaffold's docs
  referenced ("CI-ready") but which did not actually exist yet.
- Verified the Prisma schema covers all 12 tables the spec requires.
- Verified the fixture JSON is schema-accurate against Postcodes.io's
  documented response shape and real-world coordinates for SW1A 1AA.
- No fabricated data, no fake "last verified" dates, no skipped error paths
  found — the scaffold's own anti-fabrication principles were followed
  consistently by the code that was already there.

### What was NOT run, and why
This project was built and reviewed in a sandboxed environment with **no
outbound network access** — `npm install` fails (registry not reachable), so
`npm test`, `npm run typecheck`, `npm run build`, `npm run lint`, and
`npm run dev` could not be executed or verified here. Every file was instead
reviewed by hand, line by line, for correctness.

**Action required from you before trusting this code**: on a machine with
normal internet access —
```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```
Report back anything that fails. The most likely issues are dependency
version drift (versions were chosen from training knowledge and the ecosystem
moves fast) and the hand-built Postcodes.io fixture not matching the live API
in some field it wasn't given credit for — both are quick fixes once caught
by a real toolchain.

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- No live verification of the Postcodes.io response shape against the real
  API today
- `DATA_SOURCES.md` "last verified" dates are honestly left as placeholders,
  not fabricated
- No database has actually been provisioned/migrated against this schema
- Phases 2–12 (Carbon Intensity, PVGIS, GreenScore, SolarScore, Energy Now UI,
  AI Advisor, Action Plans, auth, security hardening, investor demo, final QA)
  are not started

### Next recommended phase
Phase 2: NESO Carbon Intensity integration — same adapter pattern as Phase 1
(`CarbonIntensityAdapter` implementing `DataAdapter<TInput, TOutput>`, fixture
mode, Zod-validated parsing, unit + integration tests, docs updated).

---

## Phase 2 — NESO Carbon Intensity integration

### What was built
- `src/server/adapters/httpClient.ts` — new shared fetch-with-timeout-and-retry
  helper (5s timeout, 1 retry on network failure or 5xx, no retry on 4xx).
  Introduced because `CarbonIntensityAdapter` makes three calls per `fetch()`;
  `PostcodesIoAdapter` (Phase 1, one call) was deliberately left as-is rather
  than refactored onto this helper — it already works and is already tested.
- `CarbonIntensityAdapter` (`src/server/adapters/carbonIntensityAdapter.ts`) —
  retrieves current intensity (`/intensity`), forecast (`/intensity/{from}/{to}`),
  and generation mix (`/generation`) from the NESO Carbon Intensity API.
  Current intensity is **required** (its failure fails the whole call); forecast
  and generation mix are **best-effort** — either can fail independently and the
  snapshot still returns with that piece marked `{ available: false, reason }`.
  Zod-validated end to end, including a closed enum for the five published
  intensity index labels so an unrecognised label fails loudly instead of
  passing through silently.
- `CarbonIntensityService` (`src/server/services/carbonIntensityService.ts`) —
  the reusable entry point future phases (Energy Now UI, GreenScore's carbon-
  optimisation component, AI Advisor grounding) will consume. Deliberately has
  no location parameter yet — NESO's national endpoints don't need one; a
  regional variant is a documented, deferred extension point, not built now
  (avoiding over-engineering a V1 feature that doesn't need it).
- `GET /api/energy/current` route, with an optional `forecastHours` query param.
  Implemented as GET rather than the POST originally sketched in API.md's
  "planned routes" table, since no request body is needed — API.md has been
  corrected to match the real, implemented shape.
- Fixtures: schema-accurate current/forecast/generation-mix responses matching
  NESO's documented API shape (`tests/fixtures/carbon-intensity/`), including a
  forecast fixture where every period correctly has `actual: null` (future
  periods never have a settled actual value — the adapter must never invent one).
- Tests: 6 unit tests on the adapter (fixture-mode snapshot, required-call
  failure, schema-mismatch failure, forecast-degrades-gracefully,
  generation-mix-degrades-gracefully, retry-on-5xx) and 4 integration tests on
  the service (success, partial degradation passed through as still-ok,
  AdapterError mapped to a service failure, unexpected error handled without
  throwing).
- Docs updated: ARCHITECTURE.md (adapter status table + new patterns
  introduced), API.md (route moved from planned to implemented, corrected to
  GET), ROADMAP.md (Phase 2 marked done), TESTING.md (coverage list).

### Deliberate design decisions worth flagging
- **No UI built yet** — per the phase scope, this is data model + service +
  route only. The Energy Now screen with interpretation copy ("Electricity is
  currently relatively low-carbon") is Phase 6, and interpretation logic
  should live there or in a dedicated interpretation function, not in this
  service — this service returns raw structured data, not conclusions.
- **Regional carbon intensity** (NESO's `/regional/postcode/{outcode}`) was
  not implemented. Noted as a documented extension point in
  `carbonIntensityService.ts` rather than silently omitted.

### What was NOT run, and why
Same sandbox constraint as Phase 0/1 — no outbound network access, so
`npm install`/`npm test`/`npm run typecheck`/`npm run build` could not be
executed here. Every new file was reviewed by hand. Run the same verification
commands listed under Phase 0/1 above, now against the Phase 2 code too.

### Next recommended phase
Phase 3: PVGIS solar integration — same adapter/service/fixture/test pattern.

---

## Phase 3 — PVGIS solar integration

### What was built
- `PvgisAdapter` (`src/server/adapters/pvgisAdapter.ts`) — calls PVGIS's
  `PVcalc` endpoint for a given lat/lon and normalises the response into an
  internal `SolarAssessment`: annual generation (kWh), monthly generation
  (12 values), annual in-plane irradiation (kWh/m², the raw "solar resource"
  figure), reported system losses, the assumptions actually used, a fixed
  `"modelled-estimate"` confidence label, and a `limitations` list (no
  shading/site-survey data, assumed roof characteristics, etc.).
- `DEFAULT_SOLAR_ASSUMPTIONS` — one configurable object (3.5 kWp, 14% loss,
  35° tilt, south-facing, roof-mounted, PVGIS-SARAH2 database) rather than
  these values being hard-coded at each call site. Callers can override any
  subset per request.
- `SolarService` (`src/server/services/solarService.ts`) — same reusable,
  Result-typed entry point pattern as `LocationService`/`CarbonIntensityService`,
  for SolarScore/GreenScore/AI Advisor to consume later.
- `POST /api/solar/assess` route, accepting lat/lon plus optional assumption
  overrides.
- Fixtures: a schema-accurate `PVcalc` success response for a London-area
  location, and an out-of-coverage-area error response
  (`tests/fixtures/pvgis/`).
- Tests: 8 unit tests on the adapter (fixture-mode normalisation, assumption
  overrides incl. verifying they reach PVGIS as real query parameters,
  400-is-invalid-input-and-is-not-retried, network failure, schema mismatch,
  wrong monthly-entry count) and 5 integration tests on the service (success,
  assumption pass-through, invalid-location vs unavailable error mapping,
  unexpected-error handling).

### A real bug found and fixed while building this phase
While handling PVGIS's HTTP 400 (returned for a location outside its coverage
area), it became clear the shared `httpClient.ts` helper (from Phase 2) was
classifying **every** 4xx status other than 404 as `temporarily_unavailable` —
the same kind used for a genuine network outage. That's wrong: a 400 is a
problem with this specific request, not a transient availability issue, and
conflating the two would have made "this location isn't supported" indistinguishable
from "the service is down" for any future adapter, not just this one. Fixed at
the source in `httpClient.ts` (4xx other than 404/429 → `invalid_input`)
rather than patched around in `pvgisAdapter.ts`, so `CarbonIntensityAdapter`
benefits from the same correction — verified this doesn't change any Phase 2
test's behaviour, since none of them exercise a non-404/429/5xx status.

### Deliberate design decisions worth flagging
- `annualIrradiationKwhPerM2` is a raw modelled figure, not a categorical
  "High/Medium/Low" solar-suitability rating. `PRODUCT_SPEC.md`'s Phase 3
  instructions asked to "normalise the response into our own internal
  SolarAssessment model" — the categorical rating belongs to SolarScore
  (Phase 5), per the thresholds already fixed in `CALCULATIONS.md`, not to
  this adapter. `prisma/schema.prisma`'s `SolarAssessment.solarResourceRating`
  field will be populated when Phase 5 computes that rating from this data.
- No persistence to the database yet, consistent with Phases 1 and 2 — this
  phase returns computed data through the service/route layer only. No phase
  so far has wired up Prisma writes; that will need to happen explicitly
  (most naturally alongside GreenScore, Phase 4, once there's a `Property` to
  attach results to) rather than being assumed already done.
- Financial payback / cost estimates are explicitly NOT computed here, per
  the Phase 3 scope in `PRODUCT_SPEC.md` — SolarScore (Phase 5) will decide
  whether/how to add an indicative financial figure, with the labelling
  language `PRODUCT_SPEC.md` requires ("Estimated", "Indicative", "Actual
  results depend on...").

### What was NOT run, and why
Same sandbox constraint as every previous phase — no outbound network access,
so `npm install`/`npm test`/`npm run typecheck`/`npm run build` could not be
executed here. Every new file was reviewed by hand, and the httpClient.ts fix
was specifically checked against all of Phase 2's existing test scenarios to
confirm no regression. Run the same verification commands listed under
Phase 0/1 above, now against the Phase 3 code too.

### Next recommended phase
Phase 4: the deterministic GreenScore engine, per the weights and inputs
already fixed in `CALCULATIONS.md`. This is the first phase that combines
outputs from multiple previous phases (`EnergyProfile`, `SolarAssessment`,
`CarbonIntensityRecord`) into one score, so it's also a natural point to
decide how/where results start getting persisted to the database.
