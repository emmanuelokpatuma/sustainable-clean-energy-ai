# Architecture

## Stack decision (Phase 0 proposal)
- **Framework**: Next.js 14 (App Router), TypeScript throughout, React 18.
  Chosen so the frontend and backend API routes live in one deployable unit for V1,
  while keeping a clean internal boundary (see below) so the backend could be split
  into a standalone service later without a rewrite.
- **Database**: PostgreSQL via Prisma ORM. Relational, strong typing, easy migrations.
- **Validation**: Zod for all external input (postcodes, API responses, request bodies).
- **Testing**: Vitest for unit + integration tests; MSW (Mock Service Worker) to
  intercept HTTP calls in tests so nothing depends on live third-party APIs.
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
src/server/services/          → Business/domain logic: location, calculations,
                                 recommendations, AI context construction.
src/server/db/                → Prisma client singleton + repository-style helpers.
src/server/lib/               → Cross-cutting: env validation, logging, errors.
prisma/schema.prisma          → Database schema.
tests/                        → Unit + integration tests, fixtures for offline use.
```

Rule: **API route handlers call services; services call adapters.** Route handlers
never call an adapter directly, so a UI change never has to know about NESO's JSON
shape, and a provider swap never has to touch the UI.

## External data adapters (interfaces defined, some implemented in later phases)
| Adapter | Source | Status in this scaffold |
|---|---|---|
| `PostcodesIoAdapter` | Postcodes.io | Implemented (Phase 1) |
| `CarbonIntensityAdapter` | NESO Carbon Intensity API | Interface only (Phase 2) |
| `PvgisAdapter` | EU PVGIS | Interface only (Phase 3) |
| `NasaPowerAdapter` | NASA POWER | Interface only, future backup solar source |
| `EurostatAdapter` | Eurostat | Interface only, future EU expansion |
| `EiaAdapter` | US EIA | Interface only, future US expansion |

Every adapter implements a shared `DataAdapter<TInput, TOutput>` contract
(`src/server/adapters/types.ts`) with: `fetch(input)`, a fixture-mode switch driven
by `USE_FIXTURE_DATA`, source name + attribution metadata, and typed errors that
distinguish "temporarily unavailable" from "invalid input" from "unexpected shape".

## Database tables (Phase 0 schema, not all populated until later phases)
`users, properties, locations, energy_profiles, solar_assessments,
carbon_intensity_records, green_scores, recommendations, action_plans,
ai_conversations, data_sources, source_refresh_logs`
See `prisma/schema.prisma` for field-level detail.

## Privacy-by-design
- Store only the minimum needed: an outward postcode / resolved lat-lon rounded to
  a privacy-safe precision, not a full address, unless a feature genuinely requires it.
- No personal data is sent to the AI provider beyond what's needed to answer the
  user's question — the AI receives structured *results* (scores, assessments),
  not raw personal identifiers.
- See PRIVACY.md and SECURITY.md (created in Phase 9 / hardening phases).

## What's deliberately NOT built yet
Business Mode and the CleanTech marketplace have no routes, tables, or adapters
implemented — only architectural headroom (e.g. `properties` supports one-to-many
per user already, which Business Mode will need).
