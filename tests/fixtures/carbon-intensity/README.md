# NESO Carbon Intensity API fixtures

All three files match the documented response schema at
https://carbon-intensity.github.io/api-definitions/ for `/intensity`,
`/intensity/{from}/{to}`, and `/generation` respectively. Field values are
representative of typical GB grid conditions and internally consistent
(generation mix percentages sum to 100), but — like the Postcodes.io fixture
in `tests/fixtures/postcodes-io/` — these were hand-built to match the
documented schema rather than captured from a live call, since this project
was built without network access. **Before relying on these in CI long-term,
replace them with actual captured responses** and note the capture date here.

`forecast.json` is deliberately truncated to 6 representative half-hour
periods rather than a full 24-hour, 48-period response — the parsing logic
being tested doesn't care how many periods are in the array, and a shorter
fixture is easier to read and maintain.

Note that `actual` is `null` for every period in `forecast.json` — this is
intentional and matches real API behaviour: a future half-hour period only
ever has a `forecast` value; `actual` is populated after that period has
occurred. `current.json`'s single period has a non-null `actual` because it
represents the current (just-elapsed or in-progress) half-hour. The adapter
and its tests must never treat a `null` `actual` as an error or invent a
substitute value for it.
