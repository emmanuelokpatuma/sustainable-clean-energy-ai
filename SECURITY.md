# Security

This document tracks the security posture of the application as it's built,
phase by phase. It is a living document — update it whenever a phase touches
authentication, secrets, external calls, or user data. A full security review
is scheduled as Phase 10 in `ROADMAP.md`; this file is not a substitute for
that review, and no claim of "production-ready" should be made until Phase 10
and a human/legal review have both happened.

## Current state (Phase 0 / 1)

### Secrets
- `ANTHROPIC_API_KEY` and any future adapter keys are read only in
  `src/server/lib/env.ts` (server-side code) and are never referenced from
  any file under a client-rendered path. Postcodes.io, the NESO Carbon
  Intensity API and PVGIS currently require no key at all.
- `.env` and `.env.local` are git-ignored (`.gitignore`). `.env.example`
  contains placeholder values only, never real credentials.
- No secret is logged. `src/server/lib/logger.ts` logs structured fields
  passed explicitly by call sites — reviewers should keep enforcing that no
  call site ever passes a raw request body, API key, or full postcode where a
  log field is expected.

### Input validation
- All external input (postcode submissions, adapter HTTP responses) is
  validated with Zod schemas before use — see `postcode.ts` and
  `postcodesIoAdapter.ts`. An unexpected shape is treated as an error, never
  coerced into a best-guess value.

### Data minimisation
- Only the outward postcode (e.g. "SW1A", not "SW1A 1AA") and resolved
  coordinates are intended for storage (see `PRIVACY.md` and the `Location`
  model in `prisma/schema.prisma`) — not a full address.

### Not yet implemented / open items for later phases
- **Authentication & authorisation** (Phase 9): no login system exists yet.
  There is no session handling, no password storage, and no per-user access
  control to review yet — this is the single biggest open item.
- **Rate limiting**: no rate limiting exists yet on `/api/location/resolve`
  or any future route. Needed before public launch to protect both this
  service and upstream free APIs from abuse.
- **CORS**: not yet configured; Next.js defaults apply. Needs explicit
  configuration once the API is consumed from any origin other than the
  bundled frontend.
- **Dependency vulnerability scanning**: not yet wired into CI. `npm audit`
  (or a tool like Dependabot/Snyk) should run in the CI workflow before
  launch — see `.github/workflows/ci.yml`, where this is called out as a
  TODO rather than silently omitted.
- **Prompt injection (Phase 7, AI Advisor)**: mitigated, not eliminated.
  The system prompt (`src/server/advisor/systemPrompt.ts`) wraps the
  structured grounding context in explicit `<structured_data>` delimiters
  and instructs the model that content inside those tags — and anything in
  the user's own message — is untrusted data, never an instruction that can
  override the hard rules. This matters because the grounding context can
  itself carry attacker-controlled text before Phase 8 exists (e.g. a future
  user-submitted note), not just the user's own chat message — the eval
  dataset's `prompt_injection` category (`tests/eval/advisor-eval-dataset.ts`,
  4 cases) specifically tests an injection attempt embedded in the structured
  data itself, not just the question. This has NOT been verified against a
  live model yet (no network access in this environment) — running
  `tests/eval/run-advisor-eval.ts` is required before trusting this
  mitigation in production, and a delimiter-based defence is inherently
  probabilistic, not a guarantee, for any LLM-based system.
- **AI provider availability/API key handling**: `AiAdvisorAdapter` never
  exposes `ANTHROPIC_API_KEY` to the client (server-side route handler only,
  consistent with every other secret in this project) and returns a generic
  "not configured correctly" message rather than leaking the underlying "no
  API key" detail to the client — see `aiAdvisorService.ts`'s error mapping
  and its own test for this.
- **Database access control**: no row-level security or per-tenant isolation
  has been designed yet, since there is only a single-tenant Prisma client
  today. Needed before multi-user production use.

## Principle for future work
Every phase that touches secrets, external calls, or user data must update
this file with what changed and what's still open — a security review at the
end (Phase 10) should find a short, already-mostly-addressed list, not a
first read of the whole codebase.
