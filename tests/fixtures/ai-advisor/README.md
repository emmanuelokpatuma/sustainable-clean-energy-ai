# AI Advisor fixtures

`sample-response.json` matches the documented Anthropic Messages API response
shape (`content: [{ type: "text", text: ... }]`, plus the usual `id`,
`model`, `stop_reason`, `usage` fields) — hand-built to that schema rather
than captured from a live call, since this project was built without network
access, same caveat as every other fixture here.

The sample answer text itself was hand-written to demonstrate good grounded
behaviour (references specific numbers that would appear in a matching
grounding context, notes the PVGIS estimate isn't a physical survey,
recommends an MCS-certified installer, distinguishes forecast from
certainty) — it is NOT a real model output and should not be used as
evidence that the real model behaves this way. That's exactly what
`tests/eval/advisor-eval-dataset.ts` exists to actually check, against a
live model, which has not been run in this environment. See
`PROGRESS.md`'s Phase 7 entry.
