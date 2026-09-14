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
