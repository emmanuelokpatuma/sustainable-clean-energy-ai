# CleanTech Advisor (V1 scaffold)

UK-first AI Sustainability & CleanTech Advisor — GreenScore, SolarScore, Energy Now,
and an AI Sustainability Advisor. See `PRODUCT_SPEC.md` for the product spec and
`ARCHITECTURE.md` for the technical design.

## Status
This is a **Phase 0–12** build — every phase in `ROADMAP.md` is implemented:
project setup, docs, testing foundation, database schema, the
postcode/location service, GB electricity carbon-intensity integration
(NESO), PVGIS solar integration, the deterministic GreenScore engine, the
deterministic SolarScore engine, the Energy Now screen, the AI
Sustainability Advisor, the deterministic Action Plan engine,
authentication/privacy, a scoped security-hardening pass, an investor demo
mode (`/demo` + `DEMO_SCRIPT.md`), and a final QA report.

**"All phases implemented" does not mean production-ready.** Read
`FINAL_QA_REPORT.md` before deploying this anywhere real — it documents a
P0 list that includes the still-unrun AI Advisor evaluation
(`tests/eval/README.md`) and the fact that nothing in this project has ever
been executed (`npm install`/`npm test`/`npm run build`/a database
migration), since it was built entirely without network access. See
`PROGRESS.md` for the authoritative phase-by-phase history.

> This scaffold was generated without network access (no `npm install` or
> `npm test` could be run in the build environment). Run the verification steps
> below yourself before trusting that anything works.

## Setup
```bash
npm install
cp .env.example .env.local
# edit .env.local with a real DATABASE_URL etc.
npm run db:generate
npm run db:migrate   # requires a running Postgres instance
npm run typecheck
npm run test
npm run dev
```

## Project structure
See `ARCHITECTURE.md` → "Layering" section.

## Testing philosophy
Adapters are tested against recorded fixtures (`tests/fixtures/`), not live
third-party APIs, so `npm test` works offline and in CI. A small number of
integration tests are marked to optionally run against live endpoints — see
`TESTING.md`.

## Documentation index
- `PRODUCT_SPEC.md` — what we're building and why
- `ARCHITECTURE.md` — technical design and layering rules
- `DATA_SOURCES.md` — every external data source, licence and status
- `CALCULATIONS.md` — GreenScore / SolarScore formula spec (fixed in Phase 0;
  implemented in Phase 4/5)
- `SECURITY.md`, `PRIVACY.md` — current posture, updated every phase that
  touches secrets/data; full review is Phase 10
- `API.md` — route/endpoint reference (grows each phase)
- `ROADMAP.md` — phase-by-phase plan
- `PROGRESS.md` — actual current state, updated every phase
- `TESTING.md` — test strategy and fixture policy
- `DEMO_SCRIPT.md` — the 90-second investor demo walkthrough for `/demo` (Phase 11)
- `FINAL_QA_REPORT.md` — production-readiness assessment and P0/P1/P2 severity list (Phase 12)
