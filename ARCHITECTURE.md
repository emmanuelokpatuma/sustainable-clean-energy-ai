# Architecture

## Stack decision (Phase 0 proposal)
- **Framework**: Next.js 14 (App Router), TypeScript throughout, React 18.
  Chosen so the frontend and backend API routes live in one deployable unit for V1,
  while keeping a clean internal boundary (see below) so the backend could be split
  into a standalone service later without a rewrite.
- **Database**: PostgreSQL via Prisma ORM. Relational, strong typing, easy migrations.
- **Validation**: Zod for all external input (postcodes, API responses, request bodies).
- **Testing**: Vitest for unit + integration tests. HTTP calls are mocked with
  Vitest's built-in `vi.stubGlobal("fetch", ...)` — no extra mocking library —
  so nothing depends on live third-party APIs.
- **AI**: Anthropic API, called server-side only, never from the client bundle.
- **Deployment target**: any Node 20+ host with a managed Postgres instance
  (e.g. Vercel + a managed Postgres provider, or a container platform). No
  Docker/DB was available in the build sandbox that produced this scaffold — the
  Prisma schema targets Postgres and must be provisioned in your real environment.

## Layering (clean architecture)
```
src/app/                      → Next.js routes: pages + API route handlers (thin)
src/server/adapters/          → One file per external data source. ONLY place
                                 that knows about a third-party API's shape.
src/server/calculations/      → Pure, deterministic calculation/interpretation
                                 engines (GreenScore, SolarScore, Energy Now
                                 interpretation, the Action Plan rules engine)
                                 plus `mathUtils.ts` — small shared helpers
                                 (`clamp`, `lerpScore`, `levelFor`) used by
                                 more than one engine so their interpolation
                                 and High/Medium/Low bucketing can't silently
                                 drift apart. No I/O, no network, no LLM
                                 calls — see CALCULATIONS.md.
src/server/services/          → Business/domain logic that DOES need I/O:
                                 adapter orchestration, error translation.
src/server/advisor/           → Phase 7's AI Advisor-specific pure logic:
                                 `groundingContext.ts` (assembles already-
                                 computed results into the structured context
                                 the AI is allowed to reason from) and
                                 `systemPrompt.ts` (the fixed rules + safety
                                 constraints). Both pure — no I/O — kept
                                 separate from `calculations/` since they're
                                 specific to the AI Advisor feature rather
                                 than general-purpose scoring engines.
src/server/db/                → Prisma client singleton + repository-style helpers.
src/server/lib/                → Cross-cutting: env validation, logging, errors,
                                 password hashing, session tokens, and
                                 `getCurrentUser()` (Phase 9).
src/server/validation/         → Shared Zod schemas for validating an
                                 already-computed result (GreenScoreResult,
                                 SolarScoreResult, etc.) when it's passed back
                                 in as request input to another route —
                                 extracted once a second route needed the
                                 identical schema (see `resultSchemas.ts`'s
                                 own comment).
prisma/schema.prisma           → Database schema.
tests/                         → Unit + integration tests, fixtures for offline use.
tests/eval/                    → The AI Advisor's evaluation dataset and harness
                                 (PRODUCT_SPEC.md, Phase 7) — a live-model eval,
                                 not a vitest unit test; see tests/eval/README.md.
```

Rule: **API route handlers call services or the calculation engine directly;
services call adapters.** A route may skip a service wrapper when there's no
I/O or error-translation step worth one — see
`src/app/api/scores/green/route.ts`'s own comment on why it calls
`calculateGreenScore` directly. The calculation engine itself never calls an
adapter or the network, which is what keeps GreenScore deterministic,
side-effect-free, and testable as plain functions.

## External data adapters (interfaces defined, some implemented in later phases)
| Adapter | Source | Status in this scaffold |
|---|---|---|
| `PostcodesIoAdapter` | Postcodes.io | Implemented (Phase 1) |
| `CarbonIntensityAdapter` | NESO Carbon Intensity API | Implemented (Phase 2) |
| `PvgisAdapter` | European Commission PVGIS | Implemented (Phase 3) |
| `AiAdvisorAdapter` | Anthropic API | Implemented (Phase 7) |
| `NasaPowerAdapter` | NASA POWER | Interface only, future backup solar source |
| `EurostatAdapter` | Eurostat | Interface only, future EU expansion |
| `EiaAdapter` | US EIA | Interface only, future US expansion |

Every adapter implements a shared `DataAdapter<TInput, TOutput>` contract
(`src/server/adapters/types.ts`) with: `fetch(input)`, a fixture-mode switch driven
by `USE_FIXTURE_DATA`, source name + attribution metadata, and typed errors that
distinguish "temporarily unavailable" from "invalid input" from "unexpected shape".

`CarbonIntensityAdapter` (Phase 2) introduced `src/server/adapters/httpClient.ts`,
a shared fetch-with-timeout-and-retry helper, since it makes three separate calls
per `fetch()` (current intensity, forecast, generation mix) and inlining
timeout/retry/error-wrapping three times would drift out of sync. It also
introduces the **graceful partial degradation** pattern: current intensity is
required (its failure fails the whole call), but forecast and generation mix are
best-effort — if either fails, the snapshot still returns with that piece marked
`{ available: false, reason }` rather than fabricating a value or discarding data
that did succeed.

`PvgisAdapter` (Phase 3) reuses `httpClient.ts` and, while building it, fixed a
real bug in that shared helper: any 4xx status other than 404 was being
classified as `temporarily_unavailable` — indistinguishable from a genuine
network outage. PVGIS returns HTTP 400 (not 404) for a location outside its
radiation database's coverage area, which is an `invalid_input` situation, not
an outage. `httpClient.ts` now classifies any 4xx except 404 (already handled)
and 429 (its own `rate_limited` kind) as `invalid_input`. This also makes
`CarbonIntensityAdapter`'s error handling more correct in the same way, with no
behaviour change to its existing tests (none of them exercise a non-404,
non-429, non-5xx status).

`PvgisAdapter` also deliberately returns `annualIrradiationKwhPerM2` as a raw
modelled figure (PVGIS's `H(i)_y`), not a High/Medium/Low "solar suitability"
rating — turning a physical quantity into a categorical rating is SolarScore's
job (Phase 5), using thresholds fixed in `CALCULATIONS.md`, not something this
adapter should decide on its own.

## Database tables (Phase 0 schema; `users`, `properties`, `locations`, and
`green_scores` are now actually populated as of Phase 9 — see below. The
rest remain schema-only, not yet written to.)
`users, properties, locations, energy_profiles, solar_assessments,
carbon_intensity_records, green_scores, recommendations, action_plans,
ai_conversations, data_sources, source_refresh_logs`
See `prisma/schema.prisma` for field-level detail.

## Persistence (Phase 9 — one real slice, not everything)
The first routes in this project that actually write to the database:
`POST /api/properties` (creates a `Property` + `Location` for the logged-in
user) and `POST /api/scores/green`'s optional `propertyId` (saves the
computed result to `GreenScore`, ownership-checked). Every prior phase's
routes remain stateless — chosen deliberately as one complete, real slice
(auth → save a property → save/retrieve its GreenScore history) rather than
attempting to wire all eight prior phases' outputs into the database at
once. `SolarScore`, `AiConversation`, and `ActionPlan`/`Recommendation`
persistence are NOT wired — see `PROGRESS.md`'s Phase 9 entry for the exact
boundary.

## Privacy-by-design
- Store only the minimum needed: an outward postcode / resolved lat-lon rounded to
  a privacy-safe precision, not a full address, unless a feature genuinely requires it.
- No personal data is sent to the AI provider beyond what's needed to answer the
  user's question — the AI receives structured *results* (scores, assessments),
  not raw personal identifiers.
- See `PRIVACY.md` and `SECURITY.md` — both existed since Phase 0's review
  pass as forward-looking documents, and were substantially rewritten in
  Phase 9 now that real accounts, sessions, and persistence exist to
  describe accurately rather than speculatively.

## What's deliberately NOT built yet
Business Mode and the CleanTech marketplace have no routes, tables, or adapters
implemented — only architectural headroom (e.g. `properties` supports one-to-many
per user already, which Business Mode will need).
