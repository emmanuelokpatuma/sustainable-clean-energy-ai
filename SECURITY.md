# Security

This document tracks the security posture of the application as it's built,
phase by phase. It is a living document — update it whenever a phase touches
authentication, secrets, external calls, or user data. A full security review
is scheduled as Phase 10 in `ROADMAP.md`; this file is not a substitute for
that review, and no claim of "production-ready" should be made until Phase 10
and a human/legal review have both happened.

## Current state (through Phase 9)

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

### Authentication (Phase 9 — implemented)
- **Password storage**: scrypt (Node's built-in `crypto`), salted per-user,
  never plain text — see `src/server/lib/password.ts` for the rationale for
  not adding a dedicated bcrypt/argon2 dependency for V1.
- **Sessions**: a signed (HMAC-SHA256), expiring (30-day) token in an
  `httpOnly`, `sameSite: lax`, `secure`-in-production cookie — see
  `src/server/lib/session.ts`. Not a full JWT library, deliberately (see
  that file's own comment) — this is a contained, auditable ~90 lines, not
  a general-purpose token system.
- **`SESSION_SECRET`**: required and validated (≥32 chars) at first use in
  production — the app throws rather than silently signing with a weak or
  absent secret. In development, falls back to a per-process random secret
  with a logged warning, so local work doesn't require setting one, but
  sessions won't survive a restart until one is set.
- **Login enumeration resistance**: `AuthService.logIn` returns the
  identical message ("Invalid email or password.") whether the email
  doesn't exist or the password is wrong — verified by a dedicated test
  (`tests/unit/auth-service.test.ts`) that checks both messages are
  byte-for-byte the same string, not just similar.
- **Account deletion**: `DELETE /api/auth/account` requires re-entering the
  current password (a deliberate extra confirmation for an irreversible,
  cascading delete) and actually removes the row via `prisma.user.delete`,
  which cascades to every `Property`, `GreenScore`, and `AiConversation`
  linked to it via `onDelete: Cascade` in `prisma/schema.prisma`.
- **Ownership checks**: every route touching a `Property` (saving a
  GreenScore to it, reading its history) checks `property.userId ===
  currentUser.id` before proceeding — see `/api/scores/green` and
  `/api/properties/[id]/green-scores`.

### Not yet implemented / open items — authentication-specific
These are real gaps a production launch needs to close, not just a "later"
gesture:
- **No rate limiting on login or signup.** This is the single biggest
  concrete risk introduced by this phase: without it, `/api/auth/login` is
  brute-forceable and `/api/auth/signup` can be used to enumerate or spam
  account creation. This should be fixed before Phase 9's auth is exposed
  to real traffic, not deferred to the general Phase 10 rate-limiting item
  below.
- **No email verification.** An account can be created with any email
  address, including one the person doesn't own.
- **No password-reset flow.** A user who forgets their password currently
  has no self-service recovery path.
- **No CSRF protection beyond `sameSite: lax`.** Adequate for this app's
  current same-origin fetch-based routes, but should be revisited if a
  cross-origin client (e.g. a future mobile app) is added.
- **No audit log of authentication events** beyond the structured `logger`
  calls on signup/account-deletion — no login-attempt history, no
  session-revocation-on-password-change (changing a password doesn't
  invalidate other active sessions, since sessions aren't tracked
  server-side at all — they're a stateless signed token, so there is
  nothing to revoke without adding a server-side session store).

### Not yet implemented / open items for later phases
- **Rate limiting**: no rate limiting exists yet on any route (see the
  auth-specific callout above for why this matters most urgently there).
  Needed before public launch to protect this service, upstream free APIs,
  and the AI provider (which bills per token) from abuse.
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
- **Database access control**: no database-level row-level security exists
  — ownership isolation is enforced entirely in application code (the
  `property.userId === currentUser.id` checks noted above), not by Postgres
  itself. That's adequate for a single application server talking to its
  own database, but means a bug in a future route's ownership check has no
  second line of defence. Worth revisiting (e.g. Postgres RLS policies) if
  this database is ever queried by anything other than this application.

## Principle for future work
Every phase that touches secrets, external calls, or user data must update
this file with what changed and what's still open — a security review at the
end (Phase 10) should find a short, already-mostly-addressed list, not a
first read of the whole codebase.
