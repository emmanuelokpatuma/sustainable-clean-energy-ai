# Data Sources Register

Every external data source used by this application must be listed here before
its adapter is used against live data. **Never silently substitute a different
source** — update this file and get sign-off first.

---

## Postcodes.io
- **Official URL**: https://postcodes.io
- **Data used**: UK postcode → latitude/longitude, admin district, region
- **Licence**: Open Government Licence / ONS Postcode Directory (via postcodes.io)
- **Commercial-use status**: Free, open, designed for reuse including commercial —
  verify current terms on the site before scaling usage
- **Attribution requirements**: Attribute ONS/Postcodes.io per their documentation
- **API limits**: No published hard key-based limit as of last review; be a good
  citizen (cache results, avoid redundant calls)
- **Refresh frequency**: On-demand, per user postcode entry (result cached in `locations`)
- **Date last verified**: NOT YET VERIFIED IN THIS SESSION — verify against
  https://postcodes.io before relying on this in production
- **Backup source**: OS Open Names / OS Code-Point Open (manual fallback)

## NESO Carbon Intensity API
- **Official URL**: https://carbonintensity.org.uk
- **Data used**: GB electricity carbon intensity (current, forecast, generation mix, regional)
- **Licence**: Published as open data by National Energy System Operator (NESO,
  formerly National Grid ESO)
- **Commercial-use status**: Designed for open reuse — verify current terms before
  relying on it commercially
- **Attribution requirements**: Attribute NESO / Carbon Intensity API per their docs
- **API limits**: No published API key requirement as of last review; no confirmed
  hard rate limit — implement backoff regardless
- **Refresh frequency**: Data updates roughly every 30 minutes upstream; poll no
  more often than that
- **Date last verified**: NOT YET VERIFIED IN THIS SESSION
- **Backup source**: Elexon BMRS (more complex, higher-fidelity fallback)

## European Commission PVGIS
- **Official URL**: https://re.jrc.ec.europa.eu/pvg_tools/en/
- **Data used**: Solar resource and modelled PV generation for a given location
- **Licence**: EU Joint Research Centre open data — verify current reuse terms
- **Commercial-use status**: Generally open for reuse with attribution — verify
  current terms before relying on it commercially
- **Attribution requirements**: Attribute European Commission Joint Research Centre (PVGIS)
- **API limits**: No published key requirement as of last review; be conservative
  with request volume
- **Refresh frequency**: Static/typical-year modelled data — safe to cache long-term
  per location
- **Date last verified**: NOT YET VERIFIED IN THIS SESSION
- **Backup source**: NASA POWER (global solar irradiance dataset)

## NASA POWER (future backup / global expansion)
- **Official URL**: https://power.larc.nasa.gov
- **Data used**: Solar irradiance, meteorological data (not yet integrated)
- **Licence**: NASA open data
- **Commercial-use status**: Open — verify current terms
- **Status**: Adapter interface only, not implemented in V1

## Eurostat (future EU expansion)
- **Status**: Adapter interface only, not implemented in V1

## US EIA (future US expansion)
- **Status**: Adapter interface only, not implemented in V1

---

**Important**: The "date last verified" fields above are placeholders. Whoever
runs this project against live traffic must actually visit each source, confirm
current licensing/rate-limit terms, and fill these in — do not treat this
scaffold's text as a substitute for that check.
