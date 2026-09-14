# API

Backend API contract, implemented as Next.js Route Handlers under `src/app/api/`.
All routes are server-side only — no adapter or database credential is ever
exposed to the client bundle.

## Conventions
- Request/response bodies are JSON.
- Every response includes `ok: boolean`. On failure, `message` is a short,
  user-safe string (never a raw stack trace or internal error).
- Timestamps are ISO 8601 strings.
- No route currently requires authentication (Phase 9 will add this — routes
  that need a logged-in user will be documented here when they exist).

---

## `POST /api/location/resolve`
**Status: implemented (Phase 1).**

Resolves a UK postcode to coordinates and basic geographic metadata via the
`LocationService` → `PostcodesIoAdapter`.

### Request
```json
{ "postcode": "SW1A 1AA" }
```
- `postcode` (string, required, 1–16 chars): raw user input; validated and
  normalized server-side. Case-insensitive, whitespace-tolerant.

### Response — success (200)
```json
{
  "ok": true,
  "location": {
    "latitude": 51.501009,
    "longitude": -0.141588,
    "adminDistrict": "Westminster",
    "region": "London",
    "postcodeOutward": "SW1A",
    "source": "Postcodes.io",
    "retrievedAt": "2026-09-14T10:00:00.000Z"
  }
}
```

### Response — failure
| Status | Cause | Example `message` |
|---|---|---|
| 400 | Missing/malformed request body, or postcode fails format validation | "That doesn't look like a valid UK postcode." |
| 404 | Well-formed postcode, but not found by Postcodes.io | "That postcode could not be found." |
| 503 | Postcodes.io unreachable, timed out, or returned an unexpected shape | "We couldn't verify that postcode right now. Please try again in a moment." |

The client must treat any non-`ok:true` response as a failure to display, not
attempt to read a `location` field from it.

---

## `GET /api/energy/current`
**Status: implemented (Phase 2; `interpretation` added in Phase 6).**

Returns current and forecast GB electricity carbon intensity plus the current
generation mix, via `CarbonIntensityService` → `CarbonIntensityAdapter`. Read-only
national data — no request body needed, hence `GET` rather than the `POST` this
file originally planned before the route existed (see `PROGRESS.md`).

### Query parameters
- `forecastHours` (optional, positive number, default 24): how far ahead to
  request forecast data.

### Response — success (200)
```json
{
  "ok": true,
  "energyNow": {
    "current": {
      "from": "2026-09-14T11:00Z",
      "to": "2026-09-14T11:30Z",
      "forecast": 148,
      "actual": 152,
      "index": "moderate"
    },
    "forecast": {
      "available": true,
      "periods": [ { "from": "...", "to": "...", "forecast": 121, "actual": null, "index": "low" } ]
    },
    "generationMix": {
      "available": true,
      "mix": [ { "fuel": "wind", "percentage": 21.9 } ]
    },
    "source": "NESO Carbon Intensity API",
    "retrievedAt": "2026-09-14T11:05:00.000Z",
    "isFixture": false
  },
  "interpretation": {
    "currentSummary": "Electricity is currently at a moderate carbon intensity.",
    "currentIndex": "moderate",
    "flexibleUseSuggestion": {
      "available": true,
      "from": "2026-09-14T13:00Z",
      "to": "2026-09-14T13:30Z",
      "timingLabel": "later today (afternoon)",
      "forecastGCo2PerKwh": 98,
      "index": "low",
      "message": "Later today (afternoon) may be a better time for flexible electricity use."
    },
    "essentialServicesCaveat": "This applies to flexible, discretionary electricity use only — things like EV charging, washing machines, dishwashers, or battery charging. It is not a suggestion to change heating or any other essential service.",
    "forecastDisclaimer": "This is based on a forecast, not a certainty — actual grid conditions can change."
  }
}
```
`interpretation` is computed by the pure `interpretEnergyNow` engine
(`CALCULATIONS.md`) from the exact same `energyNow` data in this response —
the two can never disagree because one isn't fetched separately from the
other. When `energyNow.forecast.available` is `false`, or no forecast period
meaningfully beats the current value, `flexibleUseSuggestion` is
`{ available: false, reason }` instead — a client should show the `reason`
as plain text, not treat it as an error.

Note the partial-degradation shape: `forecast` and `generationMix` are each
either `{ available: true, ... }` or `{ available: false, reason }`. A client
must check `available` on each independently — `current` succeeding does not
guarantee `forecast` or `generationMix` did. `actual` is `null` for any period
that hasn't happened yet (a real API characteristic, not a bug) — never treat
`null` as zero or omit the field.

### Response — failure
| Status | Cause | Example `message` |
|---|---|---|
| 400 | `forecastHours` present but not a positive number | "forecastHours must be a positive number." |
| 503 | Current intensity (the required piece) unreachable, timed out, or malformed after retry | "Live electricity carbon-intensity data is temporarily unavailable. Please try again shortly." |

### Screen
`src/app/energy-now/page.tsx` (Phase 6) — fetches this route once and renders
the current-conditions summary, the flexible-use suggestion (or its reason),
the generation mix, and a "Why?" toggle showing the raw underlying numbers,
source, and retrieval time.

---

## `POST /api/solar/assess`
**Status: implemented (Phase 3).**

Returns a modelled solar PV assessment for a given latitude/longitude, via
`SolarService` → `PvgisAdapter`. `POST` (unlike `/api/energy/current`'s `GET`)
because a specific location is always required.

### Request
```json
{ "latitude": 51.501, "longitude": -0.1416 }
```
- `latitude` (number, required, -90 to 90)
- `longitude` (number, required, -180 to 180)
- `assumptions` (object, optional): overrides for the default system
  assumptions (`peakPowerKw`, `lossPercent`, `tiltDeg`, `azimuthDeg`,
  `mountingType`, `radiationDatabase` — see `DEFAULT_SOLAR_ASSUMPTIONS` in
  `pvgisAdapter.ts`). Not exposed in the UI yet; present so a future
  "what if I had a bigger system" feature doesn't need a route change.

### Response — success (200)
```json
{
  "ok": true,
  "solarAssessment": {
    "annualGenerationKwh": 3170,
    "monthlyGenerationKwh": [100, 166, 266, 365, 415, 415, 398, 365, 282, 199, 116, 83],
    "annualIrradiationKwhPerM2": 1058,
    "systemLossPercent": 18.9,
    "assumptions": {
      "peakPowerKw": 3.5, "lossPercent": 14, "tiltDeg": 35,
      "azimuthDeg": 0, "mountingType": "building", "radiationDatabase": "PVGIS-SARAH2"
    },
    "confidence": "modelled-estimate",
    "limitations": ["Modelled from typical-year solar radiation data, not a physical site survey.", "..."],
    "source": "PVGIS",
    "retrievedAt": "2026-09-14T11:05:00.000Z",
    "isFixture": false
  }
}
```

`annualIrradiationKwhPerM2` is a raw modelled physical quantity (PVGIS's
`H(i)_y`), not a High/Medium/Low rating — that categorisation is computed by
SolarScore (Phase 5), not this route.

### Response — failure
| Status | Cause | Example `message` |
|---|---|---|
| 400 | Missing/malformed request body, or lat/lon out of range | "A valid latitude and longitude are required." |
| 422 | Well-formed coordinates, but outside the solar radiation database's coverage area | "We couldn't get solar data for this location — it may be outside the coverage area of the solar database we use." |
| 503 | PVGIS unreachable, timed out, or returned an unexpected shape | "We couldn't retrieve solar data right now. Please try again in a moment." |

---

## `POST /api/scores/green`
**Status: implemented (Phase 4).**

Computes a GreenScore from whatever inputs are supplied in the request body —
this route does not read from the database (persistence is Phase 9); it's a
pure calculation over data the caller already has (e.g. from the Phase 1–3
routes above). See `CALCULATIONS.md` for the full formula.

### Request
All fields are optional, but at least one must be provided or the request
fails with 422 — see below.
```json
{
  "energyProfile": {
    "annualUsageKwh": 2700,
    "hasGasHeating": true,
    "hasEvCharger": false,
    "hasBattery": false
  },
  "solarAssessment": { "annualIrradiationKwhPerM2": 1080 },
  "carbonIntensity": {
    "currentIndex": "moderate",
    "forecastValues": [140, 121, 98, 187, 245, 132]
  },
  "actionProgress": { "completed": 2, "total": 5 }
}
```
- `carbonIntensity.forecastValues`: an array of forecast gCO2/kWh numbers (the
  `forecast` field from each period returned by `GET /api/energy/current`),
  used only to gauge how much variability exists — not stored or echoed back.

### Response — success (200)
```json
{
  "ok": true,
  "greenScore": {
    "totalScore": 74,
    "formulaVersion": "1.0.0",
    "componentScores": [
      {
        "key": "energyEfficiency",
        "label": "Energy efficiency",
        "included": true,
        "score": 70,
        "baseWeight": 0.25,
        "effectiveWeight": 0.25,
        "level": "High",
        "explanation": "Annual usage of 2,700 kWh compared against typical UK household bands."
      }
    ],
    "strengths": ["Energy efficiency: ..."],
    "opportunities": [],
    "assumptions": ["GreenScore is our own transparency-focused score, not an official government rating."],
    "dataSources": ["User-provided energy profile"],
    "calculatedAt": "2026-09-14T11:05:00.000Z"
  }
}
```
`componentScores` always lists all five components, even excluded ones
(`included: false, score: null`), so a client can show what wasn't assessed
and why, not just the components that were.

### Response — failure
| Status | Cause | Example `message` |
|---|---|---|
| 400 | Malformed request body, or a field didn't match the expected shape | "One or more provided fields did not match the expected shape." |
| 422 | Every input field was omitted (or `actionProgress.total` was 0 with nothing else provided) — nothing to compute a score from | "Not enough information was provided to calculate a GreenScore. Provide at least one of: an energy profile, a solar assessment, carbon-intensity data, or action-plan progress." |

---

## `POST /api/scores/solar`
**Status: implemented (Phase 5).**

Computes a SolarScore from a `SolarAssessment` (e.g. from `/api/solar/assess`)
plus optional grid-intensity/pricing inputs. **`POST`, not the
`GET /api/scores/solar/:propertyId` this file originally planned in Phase
0** — there's no `:propertyId` to look up yet (persistence is Phase 9), so
this takes the same "pass the data directly" approach already established by
`/api/scores/green`. See `CALCULATIONS.md` for the full formula.

### Request
Only `solarAssessment` is required.
```json
{
  "solarAssessment": {
    "annualGenerationKwh": 3120,
    "monthlyGenerationKwh": [100, 166, 266, 320, 380, 400, 410, 370, 300, 210, 130, 90],
    "annualIrradiationKwhPerM2": 1080,
    "assumptions": { "peakPowerKw": 3.5 },
    "limitations": ["Modelled from typical-year solar radiation data, not a physical site survey."]
  },
  "averageGridIntensityGCo2PerKwh": 130,
  "electricityPricePencePerKwh": 27.5,
  "hasBattery": false
}
```
- `averageGridIntensityGCo2PerKwh`: optional; a labelled default (150
  gCO2/kWh) is used if omitted.
- `electricityPricePencePerKwh`: optional; if omitted, `financialOpportunity`
  is returned as `{ available: false, reason }` rather than a guessed figure.
- `selfConsumptionRateOverride`: optional 0–1; overrides the default
  35%/65% (no-battery/with-battery) assumption.

### Response — success (200)
```json
{
  "ok": true,
  "solarScore": {
    "formulaVersion": "1.0.0",
    "suitability": "High",
    "suitabilitySubScore": 78,
    "annualGenerationKwh": 3120,
    "generationPerKwp": 891,
    "monthlyGenerationKwh": [100, 166, 266, 320, 380, 400, 410, 370, 300, 210, 130, 90],
    "solarResource": { "annualIrradiationKwhPerM2": 1080 },
    "emissionsReduction": {
      "annualKgCo2": 406,
      "gridIntensityGCo2PerKwh": 130,
      "isAssumedGridIntensity": false
    },
    "financialOpportunity": {
      "available": true,
      "indicativeAnnualSavingGBP": 300.30,
      "selfConsumptionRateAssumed": 0.35,
      "electricityPricePencePerKwh": 27.5
    },
    "confidence": "modelled-estimate",
    "assumptions": ["Estimated and indicative only, based on the information provided. Actual results depend on installation, tariff, orientation, shading, consumption and other factors.", "..."],
    "limitations": ["...", "Estimated and indicative only, based on the information provided. Actual results depend on installation, tariff, orientation, shading, consumption and other factors."],
    "dataSources": ["PVGIS (via Phase 3 SolarAssessment)", "Supplied grid carbon-intensity figure", "User-provided electricity price"],
    "calculatedAt": "2026-09-14T11:05:00.000Z"
  }
}
```
Note the mandated disclaimer sentence appears verbatim in both `assumptions`
and `limitations` — never strip it out when displaying this to a user.

### Response — failure
| Status | Cause | Example `message` |
|---|---|---|
| 400 | Malformed body, or `solarAssessment` missing/didn't match the expected shape | "A valid solarAssessment (annualGenerationKwh, annualIrradiationKwhPerM2, assumptions.peakPowerKw) is required." |

Unlike `/api/scores/green`, there is no 422 case — `solarAssessment` is a
required, validated field, not one of several optional inputs, so a bad
request is always a 400.

---

## `POST /api/advisor/ask`
**Status: implemented (Phase 7). Rate-limited (Phase 10): 20 questions /
hour / IP — cost protection, since every call is a real, billed Anthropic
API request, not brute-force protection.**

Asks the AI Sustainability Advisor a question, grounded in whatever
GreenScore/SolarScore/Energy Now/location data the caller supplies. Calls
the real Anthropic API via `AiAdvisorService` → `AiAdvisorAdapter` — see
`CALCULATIONS.md`'s note that this is the one place in the system an LLM is
actually called, and `SECURITY.md`'s prompt-injection mitigation notes.
**Not yet backed by the mandatory evaluation run** — see
`tests/eval/README.md` before relying on this in production.

### Request
Only `question` is required; everything in `groundingContext` is optional
(each missing piece means the advisor will say that information isn't
available rather than guessing).
```json
{
  "groundingContext": {
    "location": { "postcodeOutward": "SW1A", "region": "London", "adminDistrict": "Westminster" },
    "greenScore": { "...": "a GreenScoreResult, e.g. from POST /api/scores/green" },
    "solarScore": { "...": "a SolarScoreResult, e.g. from POST /api/scores/solar" },
    "energyNow": {
      "current": { "index": "moderate", "actual": 148, "from": "...", "to": "..." },
      "interpretation": { "...": "the interpretation object from GET /api/energy/current" },
      "retrievedAt": "2026-09-14T11:05:00.000Z",
      "isFixture": false
    }
  },
  "conversationHistory": [
    { "role": "user", "content": "Is solar worth considering?" },
    { "role": "assistant", "content": "Based on your SolarScore..." }
  ],
  "question": "When should I charge my EV today?"
}
```
- `conversationHistory`: capped at 50 entries by this route's own validation,
  then further capped to the last 12 by `aiAdvisorService.ts` regardless of
  what's sent — "store/send only the minimum necessary conversation data" is
  enforced server-side, not left to the caller.
- `question`: 1–2000 characters.

### Response — success (200)
```json
{
  "ok": true,
  "answer": "Later this afternoon looks like a better window for that...",
  "groundingSummary": {
    "location": true,
    "greenScore": true,
    "solarScore": true,
    "energyNow": true,
    "recommendations": false
  }
}
```
`groundingSummary` reports which sections were actually available for this
answer — for UI transparency (e.g. showing "based on: GreenScore, SolarScore,
Energy Now" under the answer), not the raw context text itself.

### Response — failure
| Status | Cause | Example `message` |
|---|---|---|
| 400 | Malformed body, missing/invalid `question`, or `groundingContext` didn't match the expected shape | "The request body did not match the expected shape." |
| 429 | More than 20 requests from this IP in the last hour (Phase 10) | "Too many requests. Please try again shortly." |
| 503 | The AI provider is unreachable, rate-limited, or misconfigured | "The AI Advisor is temporarily unavailable. Please try again shortly." |

### Screen
`src/app/advisor/page.tsx` (Phase 7; now also calls `/api/action-plan/generate`
as of Phase 8) — resolves a postcode through the full Phase 1/2/3/4/5/6/8
pipeline client-side, assembles the grounding context from the results, and
provides the actual chat interface.

---

## `POST /api/action-plan/generate`
**Status: implemented (Phase 8).**

Generates a prioritised action plan from whatever GreenScore/SolarScore/
Energy Now results the caller supplies, via the pure `generateActionPlan`
engine — see `CALCULATIONS.md`'s "Recommendation priority" section for the
four V1 rules and the sort order. No service-layer wrapper, same reasoning
as `/api/scores/green` and `/api/scores/solar`.

### Request
All fields are optional (an empty body returns an empty action list with an
explanatory note, not an error) — same shapes as `/api/advisor/ask`'s
`groundingContext` fields.
```json
{
  "greenScore": { "...": "a GreenScoreResult, e.g. from POST /api/scores/green" },
  "solarScore": { "...": "a SolarScoreResult, e.g. from POST /api/scores/solar" },
  "energyNow": { "...": "the energyNow + interpretation shape from GET /api/energy/current" }
}
```

### Response — success (200)
```json
{
  "ok": true,
  "actionPlan": {
    "actions": [
      {
        "id": "shift-flexible-use",
        "title": "Shift flexible electricity use to lower-carbon periods",
        "explanation": "Later today (afternoon) may be a better time for flexible electricity use.",
        "impactCategory": "carbon",
        "estimatedImpact": { "annualKgCo2": null, "annualGBP": null, "note": "No specific figure is calculated..." },
        "difficulty": "low",
        "confidence": "medium",
        "assumptions": ["This applies to flexible, discretionary electricity use only...", "This is based on a forecast, not a certainty..."],
        "dataSources": ["NESO Carbon Intensity API (via Phase 2)"],
        "suggestedNextStep": "Check the Energy Now screen before running flexible appliances...",
        "priority": 1
      }
    ],
    "notes": ["Recommendations are generated from structured application logic..."],
    "calculatedAt": "2026-09-14T11:05:00.000Z"
  }
}
```
`actions` is always sorted by priority ascending (1 = highest). An empty
array means no rule found a genuine signal to act on — check `notes` for why,
never assume it means "everything is fine."

### Response — failure
| Status | Cause | Example `message` |
|---|---|---|
| 400 | Malformed body, or a supplied field didn't match the expected shape | "One or more provided fields did not match the expected shape." |

---

## Authentication routes (Phase 9)

All session state lives in an `httpOnly`, `sameSite: lax` cookie named
`session` (see `src/server/lib/session.ts`) — never in a response body or
localStorage. None of these routes require a body field beyond what's shown.

### `POST /api/auth/signup`
**Status: implemented. Rate-limited (Phase 10): 3 accounts / hour / IP.**

Request: `{ "email": "you@example.com", "password": "at least 10 chars" }`.
Only email + password are collected — see `PRIVACY.md`.

Success (200): `{ "ok": true, "user": { "id": "...", "email": "..." } }`,
sets the session cookie.

Failure:
| Status | Cause |
|---|---|
| 400 | Malformed email, or password shorter than 10 characters |
| 409 | An account with that email already exists |
| 429 | More than 3 signups from this IP in the last hour |

### `POST /api/auth/login`
**Status: implemented. Rate-limited (Phase 10): 5 attempts / 15 minutes / IP —
exceeding it returns 429 with a `Retry-After` header, before the request
body is even parsed.**

Request: `{ "email": "...", "password": "..." }`.

Success (200): same shape as signup, sets the session cookie.

Failure: **401** with the message `"Invalid email or password."` for both a
non-existent email and a wrong password — deliberately identical wording;
see `SECURITY.md`'s enumeration-resistance note. A malformed request body
(e.g. not a valid email shape) returns **400** with the same generic
message, for the same reason. **429** (with a `Retry-After` header) if the
rate limit above is exceeded.

### `POST /api/auth/logout`
**Status: implemented.** No body. Clears the session cookie. Always
returns `{ "ok": true }`, whether or not a session existed.

### `GET /api/auth/me`
**Status: implemented.** No auth required to call it — that's the point.
Returns `{ "ok": true, "user": { "id", "email" } }` if the session cookie is
valid and the account still exists, or `{ "ok": true, "user": null }`
otherwise. Never a 401 — "am I logged in" is a normal query, not an error.

### `DELETE /api/auth/account`
**Status: implemented.** Requires an active session AND the current
password in the body (`{ "password": "..." }`) as a confirmation step for
an irreversible action. Cascades to every `Property`, `GreenScore`, and
`AiConversation` linked to the account (`prisma/schema.prisma`'s
`onDelete: Cascade`). Clears the session cookie on success.

| Status | Cause |
|---|---|
| 401 | Not logged in, or the provided password was incorrect |
| 400 | Missing/malformed password field |

---

## `POST /api/properties`
**Status: implemented (Phase 9).** Requires an active session.

The first route in this project that writes to the database. Resolves a
postcode (via the same `LocationService` as `/api/location/resolve`) and
creates a `Property` + `Location` row owned by the current user.

Request: `{ "postcode": "SW1A 1AA", "label": "Home" }` (`label` optional,
max 60 chars — a user-given nickname, never a full address).

Success (200): `{ "ok": true, "property": { "id", "userId", "label",
"location": { "postcodeOutward", "latitude", "longitude", ... }, "createdAt" } }`.

Failure: 401 (not logged in), 400 (invalid postcode), 404 (postcode not
found), 503 (Postcodes.io unavailable) — same postcode-resolution failure
modes as `/api/location/resolve`.

## `GET /api/properties`
**Status: implemented (Phase 9).** Requires an active session. Returns
`{ "ok": true, "properties": [...] }` for the current user only, newest
first.

## `GET /api/properties/:id/green-scores`
**Status: implemented (Phase 9).** Requires an active session and
ownership of the property (404, not 403, if the property exists but belongs
to someone else — avoids confirming a given ID exists to a caller who
doesn't own it). Returns every `GreenScore` saved against that property,
newest first: `{ "ok": true, "greenScores": [...] }`.

## `POST /api/scores/green` — Phase 9 addition
**This route already existed (Phase 4) — Phase 9 added an optional
`propertyId` field, nothing else changed.** When `propertyId` is supplied:
requires an active session (401 if not logged in), and checks the property
belongs to the caller — **404**, not 403, if it exists but belongs to
someone else (matches `/api/properties/:id/green-scores`'s same choice: a
non-owner shouldn't learn that a given property ID exists at all). On
success, saves the computed result to the `GreenScore` table in addition to
returning it, and the response gains a `saved: boolean` field. Every
existing caller that doesn't pass `propertyId` sees no behaviour change at
all — this route is still fully usable stateless, exactly as in Phases 4–8.

---

## Not yet wired to persistence, despite having a database table
`SolarAssessment`/SolarScore results, `AiConversation` (Phase 7 chat
history), and `ActionPlan`/`Recommendation` (Phase 8 output) all have Prisma
models but no route writes to them yet. Phase 9 deliberately scoped its
persistence work to one complete, real slice (account → property → GreenScore
history) rather than wiring all of Phases 1–8's outputs into the database in
one pass — see `PROGRESS.md`'s Phase 9 entry for the reasoning and what a
follow-up wiring pass would need to cover.

## Planned routes (not yet implemented)

No routes remain in this table — Phase 9 was the last route-adding phase in
`ROADMAP.md`. Phases 10–12 (security hardening, investor demo, final QA) are
reviews and polish passes over what already exists, not new endpoints.
