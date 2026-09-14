# Progress

## Current state: Phase 0 + Phase 1 complete (scaffold), UNVERIFIED by execution

### What was built
**Phase 0 — architecture & project setup**
- Next.js 14 + TypeScript project structure (`src/app`, `src/server/{adapters,services,lib,db}`)
- `package.json` with the full intended dependency set (Next, React, Prisma, Zod, Vitest, MSW)
- `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Prisma schema (`prisma/schema.prisma`) with all V1 tables: users, properties,
  locations, energy_profiles, solar_assessments, carbon_intensity_records,
  green_scores, recommendations, action_plans, ai_conversations, data_sources,
  source_refresh_logs
- Shared adapter contract (`src/server/adapters/types.ts`) with typed `AdapterError`
  and a fixture-mode switch (`USE_FIXTURE_DATA`)
- Env validation (`src/server/lib/env.ts`), structured logger, Prisma client singleton
- Docs: README, ARCHITECTURE.md, PRODUCT_SPEC.md, DATA_SOURCES.md, ROADMAP.md, TESTING.md

**Phase 1 — postcode / location system**
- UK postcode format validation + normalization (`src/server/lib/postcode.ts`)
- `PostcodesIoAdapter` — real adapter implementation with timeout, 404 handling,
  Zod-validated response parsing, and a fixture mode
- `LocationService` — the reusable service future solar/energy phases will consume
- `POST /api/location/resolve` route handler (server-only; no key exposure — Postcodes.io
  needs none, but the pattern holds for later adapters that do)
- Location/Postcode screen with loading, success and error states
- Fixtures: a schema-accurate Postcodes.io response for SW1A 1AA, plus a not-found fixture
- Tests: postcode validation (unit), adapter parsing + all three error paths (unit),
  full service flow including invalid/not-found/unavailable/unexpected-error paths (integration)

### What was NOT run, and why
This scaffold was produced in a sandboxed environment with **no outbound network
access** — `npm install` fails (registry blocked), so `npm test`, `npm run typecheck`,
`npm run build`, and `npm run dev` could not be executed or verified here.

**Action required from you before trusting this code**: run, on a machine with
normal internet access:
```bash
npm install
npm run typecheck
npm test
npm run dev
```
Report back anything that fails — dependency version mismatches are the most likely
issue, since versions in `package.json` were chosen from training knowledge and may
have moved on since.

### Also not yet done (by design, deferred to later phases per ROADMAP.md)
- No live verification of the Postcodes.io response shape against the real API
  today (fixture was hand-built to match documented schema — see fixture README)
- `DATA_SOURCES.md` "last verified" dates are placeholders — need a real check
- No database has actually been provisioned/migrated against this schema
- Phases 2–12 (Carbon Intensity, PVGIS, GreenScore, SolarScore, Energy Now UI,
  AI Advisor, Action Plans, auth, security hardening, investor demo, final QA)
  are not started

### Next recommended phase
Phase 2: NESO Carbon Intensity integration — same adapter pattern as Phase 1.
