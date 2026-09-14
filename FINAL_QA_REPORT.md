# Final QA Report

**Status: this application is NOT production-ready. Read this whole
document, not just the severity table, before deciding otherwise.**

This report compiles the "what was NOT run" caveat that appears in every
phase of `PROGRESS.md`, plus a fresh code-level walkthrough of the complete
user journey and adverse conditions, plus — new in this pass — the first
genuine, executed verification anything in this project has received. It
does not repeat every phase's individual entry; read `PROGRESS.md` for
phase-by-phase detail. This document answers one question: **is it safe to
call this done?** The answer is no, for reasons specific and listed below,
not a vague gesture at more testing being generally advisable.

## The headline fact about this entire project

Every phase from 0 through 11 was built in a sandboxed environment with
**no outbound network access**. That means, until this report:

- `npm install` has never been run.
- `npm test` has never been run — all ~175 test cases across 18 test files
  have been read and hand-verified line by line, but never executed by
  Vitest.
- `npm run build` has never been run.
- No database has ever existed to run Phase 9's migration against.
- The Phase 7 AI Advisor evaluation (32 cases, `tests/eval/`) has never
  been run against a live model — flagged in every phase since Phase 7,
  now six phases running.

This report cannot change that. What it can do — and does, below — is
narrow down exactly what's actually been verified versus merely reasoned
about, using the tools genuinely available in this environment.

## What this pass actually verified (new)

This environment turned out to have a standalone TypeScript compiler
available outside the project's own dependencies (not `npm install`, which
still doesn't work here). That made a real, if partial, typecheck possible
for the first time in this project's history — not a code review, an
actual compiler run with real pass/fail results:

- **`src/server/calculations/*.ts`** (GreenScore, SolarScore, Action Plan,
  Energy Now interpretation, shared math utils) — **zero external
  dependencies**, so this compiled and typechecked cleanly under `--strict`
  with no shims needed. This is the most safety/correctness-critical pure
  logic in the whole application (every score and recommendation the app
  produces), and it is now genuinely, not just apparently, type-sound.
- **`src/server/advisor/groundingContext.ts` and `systemPrompt.ts`** —
  same result, zero errors, no shims needed.
- **`src/server/lib/password.ts` and `session.ts`** — required a hand-built
  shim for Node's built-in `crypto`/`util`/`process`/`Buffer` types (real
  `@types/node` isn't available either). Typechecked clean once shimmed.
  **One apparent error surfaced and was run to ground, not just dismissed**:
  an initial run flagged `session.ts`'s `getSessionSecret()` with a type
  error on `return cachedDevSecret` (`string | null` not assignable to
  `string`). Rather than either assume it was a tooling artifact or
  report it as a real bug without checking, it was isolated with a
  minimal reproduction: the error disappeared entirely once `process` had
  a real type instead of being unresolved, confirming it was a cascading
  artifact of the missing Node types (an unresolved `process` in one
  branch condition was interfering with the compiler's narrowing of an
  unrelated variable), not a logic bug in the session code. The
  reproduction steps are not kept in the repo — they were throwaway
  verification, not project code — but the conclusion is real: **this file
  has no real type error**, confirmed by isolating and eliminating the
  false lead rather than by assumption.
- **`src/server/lib/rateLimit.ts`** — required a hand-built `next/server`
  shim; typechecked clean. The shim setup was sanity-checked by
  deliberately breaking a property name and confirming the checker caught
  it, before trusting a clean result on the real file.

**What this does NOT verify**: anything requiring the project's actual
dependencies (Next.js's real types, Zod, Prisma's generated client),
anything requiring runtime execution (whether the logic is correct when
actually run, not just internally type-consistent), the entire `src/app/`
directory (routes and screens — not attempted, since they depend on Next's
real types throughout and a shim sophisticated enough to cover Next's
routing/JSX types would be a significant undertaking with uncertain
fidelity), and — critically — anything about the AI Advisor's actual
behaviour, which no static check can verify.

## Test suite inventory

18 test files (15 unit, 3 integration), approximately 175 test cases
(`it`/`it.each` blocks — a handful of `it.each` blocks generate more than
one executed test each, so the real number Vitest would report is
somewhat higher). Every test has been read and its expected values
hand-verified against the implementation it tests, phase by phase, as
documented in each phase's `PROGRESS.md` entry. **None have been executed.**
Run `npm test` before trusting any of them.

Separately: `tests/eval/advisor-eval-dataset.ts` (32 cases) has never been
run against a live model at all. This is not a "some things are unverified"
situation — it is a specific, named, repeatedly-flagged gate that
`PRODUCT_SPEC.md` itself says must close before Phase 7 counts as done.

## Journey walkthrough (code-level — not executed)

Per `PRODUCT_SPEC.md`'s Phase 12 instruction to test the complete journey
under normal and adverse conditions. Each row reflects a careful reading of
the actual implementation, not a guess — file/function references are
given so findings can be checked directly.

| Scenario | Expected behaviour (by code) | Confidence |
|---|---|---|
| Normal user, full journey | postcode → location (`LocationService`) → solar (`PvgisAdapter`) → energy (`CarbonIntensityService`) → GreenScore/SolarScore → Action Plan → AI Advisor, exactly as `/demo` implements | High (code is consistent end to end; not executed) |
| Invalid postcode format | `validatePostcode()` rejects before any adapter call; 400 with a specific reason | High (unit-tested: `postcode-validation.test.ts`) |
| Postcode not found | Postcodes.io 404 → `AdapterError(invalid_input)` → `LocationService` maps to `not_found` → 404 | High (unit-tested) |
| External API failure (any adapter) | Each adapter (Postcodes.io, NESO, PVGIS, Anthropic) has a timeout + typed `AdapterError`; each service maps to a safe message; no route ever fabricates a substitute value | High (unit-tested per adapter; retry logic tested for NESO/PVGIS/Anthropic) |
| Partial data (e.g. forecast unavailable but current intensity fine) | `CarbonIntensityService` degrades forecast/generationMix independently of current — verified by a dedicated test that current still succeeds when forecast fails | High (unit-tested) |
| Missing solar data | GreenScore's `renewableOpportunity` component excludes itself and renormalises; SolarScore has no fallback (it requires a SolarAssessment) — by design, not a bug | High (unit-tested for GreenScore; SolarScore's requirement is a documented design choice) |
| Missing carbon data | GreenScore's `carbonOptimisation` component excludes itself and renormalises; Energy Now screen shows an explicit unavailable state | High (unit-tested) |
| Slow network | Every adapter has an explicit timeout (5-20s depending on the call); the AI Advisor's is the longest (20s) since real model calls are slower — none tested under actual slow-network conditions, only via mocked rejections | Medium — timeout *values* are reasoned choices, not measured against real latency |
| Mobile screen | All four screens use responsive inline styles (percentage/flex widths, no fixed pixel layouts observed) — never rendered in an actual mobile viewport or browser | Low — plausible from the code, genuinely unverified visually |
| Desktop screen | Same caveat — never rendered in any browser at all | Low |
| Unauthorised access | Every property-scoped route checks `getCurrentUser()` and ownership (`property.userId === user.id`); non-owner access returns 404, not a data leak — reviewed route-by-route in Phase 10, not re-derived here | High (Phase 10's review + this report's re-confirmation of the 403→404 fix) |
| Malformed input | Every route validates with Zod before touching business logic; malformed JSON is caught explicitly (try/catch around `req.json()`) in every route reviewed | High (consistent pattern, spot-checked across all 14+ routes) |
| AI grounding | System prompt encodes every rule from `PRODUCT_SPEC.md`; grounding context construction is unit-tested (13+ tests) | **Low for actual model behaviour** — the prompt is well-constructed, but whether the model actually follows it has never been tested against a real call. This is the Phase 7 gate, not resolved by this report. |
| Database failure | No route has explicit handling for a Prisma connection failure beyond letting it throw — no route wraps the four Phase 9 DB-writing calls (`prisma.property.create`, `prisma.greenScore.create`, `prisma.user.create`, `prisma.user.delete`) in a try/catch that produces a clean error message. **This is a real gap, not just an unverified area.** | **Gap confirmed by reading the code**, not a confidence question |

The database-failure row is a genuine finding from this pass, not a
restatement of an existing note — added to the severity list below.

## Checklist (per PRODUCT_SPEC.md's Phase 12 instruction)

| Check | Result |
|---|---|
| No fake production data exists | **Pass.** Fixture data only activates via `USE_FIXTURE_DATA`, and (since Phase 11's fix) every screen can now disclose when it's active via `isFixture`. |
| No API keys are exposed | **Pass**, per Phase 10's route-by-route review, re-confirmed by grep in this pass: `ANTHROPIC_API_KEY` and `SESSION_SECRET` appear only in server-side files that never construct a client-visible response containing them. |
| Calculations are deterministic | **Pass, and now genuinely typechecked** (see above) — `calculateGreenScore`, `calculateSolarScore`, `generateActionPlan`, `interpretEnergyNow` are all pure functions with no LLM call, no I/O. |
| AI cannot invent numerical results from missing data | **Not verified.** The system prompt instructs this explicitly; the grounding context renders "not available, do not invent X" for every missing section; but whether the actual model complies has never been tested. This is the Phase 7 gate. |
| Estimates are clearly labelled | **Pass** — `SOLAR_SCORE_DISCLAIMER`, GreenScore's "not an official government rating" line, and PVGIS/NESO's own "modelled"/"forecast" language are consistently present and unit-tested. |
| Source timestamps exist where appropriate | **Pass** — `retrievedAt`/`calculatedAt` fields present throughout; spot-checked across GreenScore, SolarScore, Energy Now, and location results. |
| Licences are documented | **Partial.** `DATA_SOURCES.md` documents each source's licence and terms, but its own "last verified" dates are honest placeholders, never actually checked against live legal terms — flagged there since Phase 0 and still true. This needs an actual human legal review before any commercial use, not just a documentation format. |
| Errors are user-friendly | **Pass** — consistent pattern across all routes reviewed (specific, actionable messages; no raw stack traces or internal error text observed reaching a response body). |
| Tests pass | **Unknown.** Never executed. See "headline fact" above. |

## Severity list

### P0 — must fix before any real user touches this
1. **The Phase 7 AI Advisor evaluation has never been run.** The single
   most safety-relevant unverified claim in this project. Run
   `tests/eval/run-advisor-eval.ts` against a live model and read every
   transcript before this feature reaches anyone.
2. **`npm install`, `npm test`, `npm run build` have never been run, at
   all, across this project's entire history.** Nothing has been confirmed
   to even compile and run outside this report's narrow, dependency-free
   typecheck. This must happen before any deployment, full stop.
3. **No database migration has ever been generated or run.** Phase 9's
   entire persistence layer — signup, login, account deletion's cascade,
   property/GreenScore saving — is unverified against a real Postgres
   instance. Run `npx prisma migrate dev` and manually exercise signup →
   save a property → save a GreenScore → delete the account, confirming
   the cascade actually removes everything.
4. **No error handling around database calls** (new finding, this pass) —
   a Prisma connection failure on any of the four DB-writing routes
   (signup, property creation, GreenScore saving, account deletion)
   currently has no explicit handling and would likely surface a raw,
   unfriendly error to the client, breaking the "errors are user-friendly"
   standard the rest of the app holds to.

### P1 — should fix before launch
5. No email verification or password-reset flow (Phase 9/10, still open).
6. `DATA_SOURCES.md`'s licence/attribution/API-limit details are unverified
   placeholders — needs an actual legal/compliance review, particularly
   PVGIS/NESO/Postcodes.io's commercial-use terms, before commercial launch.
7. `npm audit` runs in CI but with `continue-on-error: true` — the real
   dependency tree has never been audited; unknown vulnerability exposure.
8. The in-memory rate limiter (Phase 10) only works for a single server
   instance — silently ineffective the moment this app is horizontally
   scaled or run serverless.
9. GreenScore's Component 2 (renewable opportunity) vs. Component 4
   (cleantech opportunity) use inconsistent definitions of "opportunity"
   (flagged since Phase 4, never resolved).
10. SolarScore, AI conversations, and Action Plans have no persistence —
    only GreenScore history is actually saved (Phase 9's deliberate scope).
11. No CSRF protection beyond `sameSite: lax` cookies.

### P2 — can fix after launch
12. No investor-grade visual/UX redesign — both Phase 10 and Phase 11
    scoped UX work down to specific, targeted fixes rather than a general
    polish pass.
13. No data export/portability path (only account deletion exists).
14. No audit log of authentication events beyond basic structured logging.
15. Efficiency and solar-suitability reference bands (`greenScore.ts`,
    `solarScore.ts`) are commonly-cited approximations, not calibrated
    against real usage data.
16. No navigation shell linking screens together — every screen
    (`/`, `/energy-now`, `/advisor`, `/settings`, `/demo`) is only reachable
    by its own direct URL.
17. Mobile/desktop rendering has never been visually verified in an actual
    browser (see journey walkthrough table).

## What "done" would actually require, in order

1. Run the Phase 7 evaluation. Read every transcript.
2. `npm install && npm run typecheck && npm test && npm run build`. Fix
   whatever those surface — treat this report's narrow typecheck as a
   partial, encouraging signal, not a substitute.
3. Provision a real Postgres instance, run the migration, manually verify
   the full auth + persistence + cascade-delete flow.
4. Add try/catch handling around the four DB-writing routes (P0 #4 above).
5. Work through the P1 list before any commercial launch; P2 at your
   discretion.

## Sign-off

This application is well-architected, consistently documented, and — as
far as static analysis and careful hand-review can establish — internally
sound. None of that is a substitute for running it. **This report does not
certify the application as production-ready, and no one should treat it as
such until the P0 list above is closed.**
