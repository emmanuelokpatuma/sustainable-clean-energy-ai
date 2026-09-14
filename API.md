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

## Planned routes (not yet implemented)

| Route | Phase | Purpose |
|---|---|---|
| `POST /api/energy/current` | 2 | Current + forecast GB carbon intensity for a location |
| `POST /api/solar/assess` | 3 | PVGIS-derived SolarAssessment for a location |
| `POST /api/scores/green` | 4 | Compute/retrieve a GreenScore for a property |
| `GET /api/scores/solar/:propertyId` | 5 | Retrieve a stored SolarScore |
| `POST /api/advisor/ask` | 7 | AI Advisor question, grounded in stored structured context |
| `POST /api/action-plan/generate` | 8 | Generate a prioritised action plan |
| `POST /api/auth/*` | 9 | Login/session endpoints |

Each will be documented here, with the same request/response/error-status
shape as above, at the point its phase is implemented — not before, so this
file never describes a route that doesn't exist yet as if it did.
