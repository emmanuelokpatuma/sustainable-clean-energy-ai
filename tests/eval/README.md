# AI Advisor evaluation

`advisor-eval-dataset.ts` — 32 representative questions covering grounded
factual answers, missing-data handling, no-savings-guarantee, no-physical-
inspection-claim, no-official-certification-claim, unsafe-instructions
refusal, estimate-vs-measurement, assumptions-surfaced, prompt injection
(both in the user's message and embedded in the structured data itself),
and general usefulness. Required by `PRODUCT_SPEC.md`'s Phase 7 section
("at least 30 representative questions").

`run-advisor-eval.ts` — runs the dataset against the real `AiAdvisorService`
(a live model call, not fixture mode) and applies automated checks:
substring presence/absence, a professional-recommendation keyword check, and
a heuristic "does every number in the answer also appear somewhere in the
supplied context" scan.

## This has not been run

Built in a sandboxed environment with no network access and no live
`ANTHROPIC_API_KEY` — see `PROGRESS.md`'s Phase 7 entry. **Per
`PRODUCT_SPEC.md`'s own instruction, the AI Advisor should not be considered
complete until this has actually been run and reviewed.**

## How to run it

```bash
ANTHROPIC_API_KEY=sk-... npx tsx tests/eval/run-advisor-eval.ts
```

This makes 32 real calls to the configured model (`ANTHROPIC_MODEL` in your
`.env`, default `claude-sonnet-5` — verify that's still current). It will
refuse to run with `USE_FIXTURE_DATA=true`, since replaying one canned fixture
answer 32 times would tell you nothing about actual model behaviour.

## What the output means

- A per-case PASS/FLAGGED line as it runs.
- A summary count at the end.
- `tests/eval/last-run-transcript.json` — every question, every answer, and
  which automated checks (if any) it failed. **Read this file.** The
  automated checks are a first-pass net:
  - A flagged case might be a real grounding/safety violation, or might be
    a harmless false positive (e.g. the number-leakage check doesn't
    understand that "£343" in the answer and "343" in the context are the
    same number written differently in some edge case, or that a
    legitimately re-derived number like a percentage isn't literally present
    in the raw context JSON).
  - A passing case can still be a bad answer the automated checks aren't
    sophisticated enough to catch (e.g. technically saying "estimate" once
    while the surrounding tone still reads as an overconfident promise).
- Treat a full run as a starting point for a human review pass across all 32
  transcripts, not a certificate that Phase 7 is safe to ship.

## After changing the system prompt or grounding context

Re-run this eval. `systemPrompt.ts` and `groundingContext.ts` are exactly
the kind of change this dataset exists to catch regressions in — a
prompt tweak that reads as an improvement for one question can weaken
grounding on another.
