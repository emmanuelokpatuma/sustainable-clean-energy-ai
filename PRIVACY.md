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

### Account data (Phase 9 — not yet implemented)
- Planned: email address only, for login. No password will be stored in
  plaintext (a hashing scheme will be specified when Phase 9 is implemented).
  This section will be expanded when that phase lands — it is listed here now
  so the schema's `User.email` field has a stated justification.

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
The "Settings / Data & Privacy" screen (`PRODUCT_SPEC.md`, screen 9) is
V1 scope but not yet built. It must, when implemented, explain in plain
language why a postcode is requested before the user enters one — the current
Phase 1 screen (`src/app/page.tsx`) has only a one-line explanation ("We'll
use this to look up solar and electricity data for your area") and should be
expanded to link to this document once Settings exists.

## Open items
- No formal legal/DPO review has happened. This document describes technical
  intent, not a compliance sign-off — see `SECURITY.md`'s note on the same
  point. A human/legal review is required before handling real user data at
  any scale, and should be tracked explicitly rather than assumed done.
