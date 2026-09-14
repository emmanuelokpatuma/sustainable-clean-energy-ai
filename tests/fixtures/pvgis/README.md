# PVGIS fixtures

`pvcalc-success.json` matches the documented response schema for the PVGIS
`PVcalc` endpoint (https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en)
for a representative London-area location, a 3.5 kWp south-facing (`azimuth: 0`)
system at 35° tilt with 14% system loss — the values in
`DEFAULT_SOLAR_ASSUMPTIONS` in `pvgisAdapter.ts`. Monthly and annual figures are
representative of typical modelled UK output for that system size and
orientation, but — like every other fixture in this project — were hand-built
to match the documented schema rather than captured from a live call, since
this project was built without network access. **Before relying on this in CI
long-term, replace it with an actual captured response** and note the capture
date here.

`pvcalc-out-of-coverage.json` matches PVGIS's documented error shape for a
location the selected radiation database doesn't cover (e.g. far outside
Europe/Africa when using `PVGIS-SARAH2`) — used to test that the adapter
surfaces this as a clear `invalid_input` error rather than a generic failure
or, worse, silently returning zeroed-out generation figures.

**Verify before production use**: the exact PVGIS parameter names and response
field names (`E_y`, `H(i)_y`, etc.) here were reconstructed from documentation
knowledge rather than a live call — confirm them against PVGIS's current API
docs before trusting this adapter with real traffic, the same caution already
noted for the Postcodes.io and NESO fixtures.
