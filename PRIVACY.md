# Privacy

This document explains what personal data this application collects, why, and
what it deliberately does not collect. It should be kept in sync with
`prisma/schema.prisma` — if a field appears in the schema, it must be
justified here.

## Principle
Collect the minimum necessary to deliver the four V1 experiences (GreenScore,
SolarScore, Energy Now, AI Advisor). When in doubt, don't store it.

## What is collected (V1, as currently implemented)

### Location (Phase 1 — implemented)
- **What**: the *outward* part of a UK postcode only (e.g. "SW1A" from
  "SW1A 1AA"), plus the latitude/longitude and admin district/region returned
  by Postcodes.io for that postcode.
- **Why**: the outward postcode plus coordinates are sufficient to retrieve
  solar and regional carbon-intensity data. The inward part (the last three
  characters, which narrows a postcode down to roughly 15 households) is
  intentionally discarded before storage — see `outwardPart()` in
  `src/server/lib/postcode.ts`.
- **Not collected**: full address, house number, inward postcode digits.

### Account data (Phase 9 — implemented)
- **What**: an email address and a password hash (scrypt-derived, salted —
  see `src/server/lib/password.ts`). Nothing else — no name, no address, no
  phone number.
- **Why**: enough to identify an account and let someone return to see their
  saved properties and GreenScore history.
- **What is never stored**: the plain-text password itself, at any point —
  it exists in memory only for the duration of the hash/verify call.
- **Saved properties**: when signed in, a property (an optional user-given
  label, e.g. "Home" — explicitly never a full address, enforced only by
  convention/UI copy today, not by validation — plus the same
  already-minimised Location fields described above) can be saved against
  the account, and GreenScore results computed for it can be saved as
  history. Nothing else from Phases 1–8 is persisted yet — no SolarScore,
  no AI conversations, no action plan completion state. See
  `PROGRESS.md`'s Phase 9 entry for exactly what's wired and what isn't.
- **Right to erasure**: `DELETE /api/auth/account` (re-confirmed with the
  account's own password) permanently deletes the user and cascades to
  every property, GreenScore, and AI conversation linked to it — see
  `prisma/schema.prisma`'s `onDelete: Cascade` chain. This is available
  from the Settings screen (`src/app/settings/page.tsx`).

### AI Advisor conversations (Phase 7 — implemented, no persistence yet)
- **Current reality**: nothing is written to a database yet — persistence
  (the `AiConversation` model) is Phase 9 (auth/DB wiring), which doesn't
  exist yet, same as every other phase's data so far. The conversation history
  a user sees lives only in their browser session for the duration of the chat.
- **What is sent to the AI provider (Anthropic) per question**: the structured
  grounding context (GreenScore/SolarScore/Energy Now results and their own
  already-minimised location fields — see below), the capped recent
  conversation history (last 12 messages, enforced server-side regardless of
  what a client sends — see `aiAdvisorService.ts`), and the current question.
  Nothing else.
- **When persistence is added (Phase 9)**: the plan remains to store the
  structured grounding context (`AiConversation.contextJson`) for
  support/debugging, with free-text conversation content minimised — the
  exact retention policy is still a Phase 9 decision, not made yet, and will
  be documented here before that phase is considered complete.

## What is never collected
- Precise property information (exact address, floor plan, meter numbers)
  unless a specific future feature makes an explicit, separately-justified
  case for it.
- Any government ID, payment card, or financial account number.
- Health, biometric, or other special-category personal data — none of the
  V1 features need it.

## Third-party data sharing
- **Postcodes.io / NESO / PVGIS**: only the postcode (Postcodes.io) or
  resolved coordinates (PVGIS) are sent — see `DATA_SOURCES.md` for exactly
  what each adapter transmits.
- **AI provider (Anthropic)**: the structured application context described
  above, including the outward postcode and region/district (the same
  already-minimised location fields used throughout the rest of this
  project — never the full precise postcode, a name, or an account
  identifier, since none of those are collected from the user in the first
  place — see Location above).

## Consent & messaging
The "Settings / Data & Privacy" screen (`PRODUCT_SPEC.md`, screen 9) is now
built (`src/app/settings/page.tsx`) — it explains what's stored and why
(email/password hash, saved properties' minimised location data, GreenScore
history) directly on the page, and provides the account-deletion path
described above. The Phase 1 postcode screen (`src/app/page.tsx`) still only
has its original one-line explanation ("We'll use this to look up solar and
electricity data for your area") — linking it to the Settings screen's fuller
explanation is a reasonable small follow-up, not done in this phase.

## Open items
- No formal legal/DPO review has happened. This document describes technical
  intent, not a compliance sign-off — see `SECURITY.md`'s note on the same
  point. A human/legal review is required before handling real user data at
  any scale, and should be tracked explicitly rather than assumed done.
- No email verification exists — an account can be created with any email
  address, including one the signer-upper doesn't own. Not a data
  minimisation problem, but worth fixing before real launch (see
  `SECURITY.md`).
- No data export ("right to access/portability") path exists yet, only
  deletion. A UK/EU-facing product should offer both.
