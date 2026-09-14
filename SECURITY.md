# Security

This document tracks the security posture of the application as it's built,
phase by phase. It is a living document — update it whenever a phase touches
authentication, secrets, external calls, or user data. A full security review
is scheduled as Phase 10 in `ROADMAP.md`; this file is not a substitute for
that review, and no claim of "production-ready" should be made until Phase 10
and a human/legal review have both happened.

## Current state (through Phase 10)

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

### Rate limiting (Phase 10 — implemented)
Closes what this document previously flagged as "the single biggest
concrete risk introduced by Phase 9." `src/server/lib/rateLimit.ts` — an
in-memory, fixed-window limiter, applied to the three routes that actually
needed it:
- `POST /api/auth/login`: 5 attempts / 15 minutes / IP (brute-force
  protection).
- `POST /api/auth/signup`: 3 accounts / hour / IP (anti-spam).
- `POST /api/advisor/ask`: 20 questions / hour / IP — this one isn't about
  brute force, it's about cost: every call is a real, billed Anthropic API
  request.

**Real, stated limitation, not glossed over**: this is in-memory per server
process. It works correctly for a single-instance deployment. It does NOT
work correctly once this app runs as multiple instances or serverless
functions — each has its own memory, so "5 per 15 minutes" silently becomes
"5 per 15 minutes per instance." A horizontally-scaled or serverless
deployment needs a shared store (Redis, or the hosting platform's own rate
limiting) instead — `enforceRateLimit()`'s call sites don't need to change,
only `rateLimit.ts`'s internals.

### Phase 10 review findings
A route-by-route read of all 14 API routes (not just the auth ones) found:
- No route returns `passwordHash` in a response, including the internal
  `prisma.user.findUnique` calls in `getCurrentUser()` and the
  account-deletion route that fetch the full user record for verification —
  checked explicitly, not just assumed from the `select` clauses elsewhere.
- No route logs an email address or password — only `userId` is logged on
  signup/account-deletion.
- No route sets any `Access-Control-*` header — confirming the "CORS: not
  yet configured" item below describes an already-secure default (no route
  opens up cross-origin access), not an open vulnerability. Downgraded from
  "needs explicit configuration" to "fine as-is until a cross-origin client
  is actually added" on that basis.
- One real bug found and fixed in Phase 9's own review (see that phase's
  entry) — the 403/404 inconsistency. No further bugs found in this pass.

### Not yet implemented / open items for later phases
- **CORS**: no route sets permissive CORS headers (verified this phase —
  see above), so this is a secure-by-default non-issue for now, not an open
  risk. Revisit only if a cross-origin client is added.
- **Dependency vulnerability scanning**: `npm audit --audit-level=high` is
  now in `.github/workflows/ci.yml`, but with `continue-on-error: true` —
  this project's dependency tree has never actually been audited (no
  network access in the environment it was built in), so the check exists
  but doesn't block yet. Run it for real, look at the result, and remove
  `continue-on-error` once someone has a confirmed clean or consciously
  accepted baseline.
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
