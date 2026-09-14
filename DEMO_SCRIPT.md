# Investor Demo Script (~90 seconds)

Run this at `/demo`. It calls the real application — the same routes every
other screen uses — not a mocked or scripted fake. If `USE_FIXTURE_DATA=true`
is set (recommended for venues with unreliable wifi), a yellow "Demo Mode"
banner appears automatically the moment any recorded example data is used —
say so out loud if it appears; never let the audience assume it's live if
the banner is showing.

**Before you present**: load `/demo` once beforehand so the page and its
JS bundle are already cached — the actual demo run should feel instant.

---

### 0:00 – 0:10 — Open
> "This is CleanTech Advisor. You give it a postcode — that's it — and it
> tells you your home's sustainability position, whether solar makes sense
> for you, what's happening with electricity right now, and what to do
> about all of it. Watch."

Click **Start Demo** (postcode is pre-filled with a representative London
address — swap it for a postcode you know if you want a specific story).

### 0:10 – 0:25 — Location & GreenScore
As the location resolves and the GreenScore appears:
> "That's a real postcode lookup, not a hardcoded address. And here's the
> GreenScore — [read the number] out of 100. This isn't us making up a
> grade — every number behind it is a deterministic calculation, never an
> AI guess. [Point at the strength shown.] That's specifically *why* it's
> that score, not just the number."

### 0:25 – 0:40 — SolarScore
> "Same postcode, run through the European Commission's own solar
> irradiance model. [Read suitability, generation, CO2 figure.] That's a
> real physics-based estimate for this exact location — not a marketing
> number."

### 0:40 – 0:55 — Energy Now
> "This part updates in real time — [read the current summary]. And when
> the grid has a genuinely cleaner window coming up, it tells you when.
> [If shown:] Right now it's saying [read the flexible-use suggestion]."

### 0:55 – 1:10 — Top 3 recommendations
> "The app turns all of that into a prioritised action list — solar,
> timing, efficiency, whatever actually applies to this property. No AI
> in the loop for this part either — these are rules, not a language
> model's opinion."

### 1:10 – 1:25 — AI Advisor
> "Now here's where the AI comes in — but only to explain, never to invent
> numbers." [Read the fixed question already shown on screen: "What should
> I do first to reduce my environmental impact while saving money?"] "And
> the answer you're reading right now is grounded entirely in the numbers
> we just saw — it can't say anything the calculations upstream didn't
> already establish."

### 1:25 – 1:30 — Close
> "Every figure on this screen — sources and assumptions — is listed right
> here at the bottom. Nothing hidden, nothing invented. That's the whole
> product."

---

## If something goes wrong live

- **A section doesn't load / shows an error**: say "that's a live API call
  timing out, not the app" and either retry once or move on — don't
  improvise a number to fill the gap. If the whole flow is going to be
  unreliable at the venue, restart with `USE_FIXTURE_DATA=true` beforehand
  so the Demo Mode banner is visible from the start and you can say so
  upfront: "we're running on cached example data today for a reliable
  connection — everything you're about to see is real application logic,
  running on a recorded example instead of a live API call."
- **The AI Advisor is slow**: real model calls take a few seconds — don't
  apologise for it, just keep talking through what's already on screen
  while it finishes.
- **Someone asks "is this real data?"**: if the Demo Mode banner is
  showing, say yes immediately and explain what it means (a recorded
  example response standing in for a live API call, chosen for reliability
  during the demo). If it's not showing, confirm every number came from a
  live call made just now.

## What this demo deliberately does NOT show

- Persisted history (saved properties, GreenScore over time) — that's real
  (Phase 9) but isn't part of this 90-second story; show it separately if asked.
- Account creation / login — skip it for pacing; mention it exists.
- Any Phase 12+ feature, since none exist yet at time of writing.
