# Postcodes.io fixtures

`valid-response.json` matches the documented Postcodes.io response schema
(https://postcodes.io/docs) for a real central-London postcode (SW1A 1AA —
Buckingham Palace, a commonly used public example in their own docs). Field
values are representative of the real documented shape and typical range, but
this exact JSON was hand-built to match the schema rather than captured live,
since this scaffold was produced without network access. **Before relying on
this in CI long-term, replace it with an actual captured response** and note
the capture date here.
