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
