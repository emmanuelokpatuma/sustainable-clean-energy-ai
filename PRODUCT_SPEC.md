# Product Specification — AI Sustainability & CleanTech Advisor (V1)

## Vision
A UK-first AI-powered sustainability and CleanTech decision platform combining open
energy, solar, weather and environmental data with transparent calculations and AI,
to help households and small businesses reduce energy costs, reduce emissions, and
decide which clean-technology actions to take first.

## V1 scope (four core experiences)
1. **Home Sustainability / GreenScore** — deterministic 0–100 score with explainable components.
2. **SolarScore** — location-based solar suitability and generation estimate (PVGIS).
3. **Energy Now** — current/forecast GB electricity carbon intensity (NESO Carbon Intensity API).
4. **AI Sustainability Advisor** — explains structured results; does not invent numbers.

Business Mode and the CleanTech marketplace are **out of scope for V1** but the
architecture (see ARCHITECTURE.md) keeps room for them without rework.

## V1 user journey
1. User opens the application.
2. User enters a UK postcode.
3. System resolves postcode → coordinates (Postcodes.io).
4. System retrieves solar resource data (PVGIS) for those coordinates.
5. System retrieves current/forecast GB carbon intensity (NESO).
6. System calculates GreenScore, SolarScore and recommendations deterministically.
7. User sees GreenScore, SolarScore, Energy Now and a prioritised action plan.
8. User can ask the AI Advisor questions grounded in that structured data.

## Core V1 screens
1. Welcome
2. Location / Postcode
3. GreenScore Dashboard
4. Home Sustainability
5. SolarScore
6. Energy Now
7. AI Sustainability Advisor
8. Action Plan
9. Settings / Data & Privacy

## Non-negotiable product principles
- Real working software — no static demo pretending to be functional in production code.
- No fabricated energy, solar, carbon or financial figures, ever.
- Estimates and assumptions are always visible and labelled ("Estimated", "Indicative",
  "Based on the information provided").
- Calculations are deterministic and separate from the AI layer (see CALCULATIONS.md).
- The AI explains and prioritises; it never invents or overrides a calculated number.
- If an external data source is unavailable, show a clear error/degraded state —
  never silently substitute fabricated or cached-as-if-live data.
- GreenScore is **our own** score, not an official government rating — always labelled as such.

## Out of scope for V1 (explicitly deferred, architected for later)
- Business Mode / multi-property management
- CleanTech marketplace / installer marketplace and transactions
- Native iOS/Android apps (V1 is a responsive web app)
- Financial payback / ROI modelling beyond indicative, clearly-caveated estimates
- Eurostat / US EIA integrations (adapters interfaced but not implemented)
