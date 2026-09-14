"use client";

import { useState } from "react";

/**
 * PRODUCT_SPEC.md's Phase 11 demo journey, verbatim:
 * 1. Enter a representative UK postcode. 2. Show location. 3. GreenScore.
 * 4. SolarScore. 5. Energy Now. 6. Top 3 recommendations. 7. Ask the AI
 * Advisor "What should I do first to reduce my environmental impact while
 * saving money?" 8. Show the structured answer. 9. Show the underlying
 * assumptions/data sources.
 *
 * "Do not create a fake application" — this calls the exact same
 * `/api/*` routes as `/advisor` and every other screen. The only thing
 * "demo" about this page is presentation (a fixed, curated postcode
 * default, a fixed investor-pitch question, and progressive reveal for
 * pacing) plus radical honesty about data provenance: a banner appears
 * the moment ANY fetched result is fixture-derived (`isFixture: true`),
 * naming it plainly — never silently presenting recorded example data as
 * live. See DEMO_SCRIPT.md for the accompanying 90-second spoken script.
 */

const DEMO_QUESTION = "What should I do first to reduce my environmental impact while saving money?";
const DEFAULT_POSTCODE = "SW1A 1AA";

type Step = "idle" | "location" | "solar" | "energy" | "scores" | "advisor" | "done" | "error";

export default function DemoScreen() {
  const [postcode, setPostcode] = useState(DEFAULT_POSTCODE);
  const [step, setStep] = useState<Step>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usedFixtureData, setUsedFixtureData] = useState(false);

  const [location, setLocation] = useState<any>(null);
  const [energyNow, setEnergyNow] = useState<any>(null);
  const [greenScore, setGreenScore] = useState<any>(null);
  const [solarScore, setSolarScore] = useState<any>(null);
  const [topActions, setTopActions] = useState<any[]>([]);
  const [advisorAnswer, setAdvisorAnswer] = useState<string | null>(null);
  const [dataSourcesAndAssumptions, setDataSourcesAndAssumptions] = useState<{
    sources: string[];
    assumptions: string[];
  }>({ sources: [], assumptions: [] });

  function noteFixture(isFixture: boolean | undefined) {
    if (isFixture) setUsedFixtureData(true);
  }

  async function runDemo() {
    setErrorMessage(null);
    setUsedFixtureData(false);
    setLocation(null);
    setEnergyNow(null);
    setGreenScore(null);
    setSolarScore(null);
    setTopActions([]);
    setAdvisorAnswer(null);

    try {
      // 1-2. Postcode -> location
      setStep("location");
      const locationRes = await fetch("/api/location/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode }),
      });
      const locationData = await locationRes.json();
      if (!locationRes.ok || !locationData.ok) {
        setErrorMessage(locationData.message ?? "Could not resolve that postcode.");
        setStep("error");
        return;
      }
      setLocation(locationData.location);
      noteFixture(locationData.location.isFixture);

      // 3-4 prep: solar assessment feeds both SolarScore and GreenScore
      setStep("solar");
      const solarRes = await fetch("/api/solar/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: locationData.location.latitude,
          longitude: locationData.location.longitude,
        }),
      });
      const solarData = await solarRes.json();
      const assessment = solarRes.ok && solarData.ok ? solarData.solarAssessment : null;
      noteFixture(assessment?.isFixture);

      // 5. Energy Now
      setStep("energy");
      const energyRes = await fetch("/api/energy/current");
      const energyData = await energyRes.json();
      const energyNowResult = energyRes.ok && energyData.ok ? energyData : null;
      setEnergyNow(energyNowResult);
      noteFixture(energyNowResult?.energyNow?.isFixture);

      // 3 & 4. GreenScore + SolarScore, computed from what we just gathered
      setStep("scores");
      const energyNowForScoring = energyNowResult
        ? {
            current: energyNowResult.energyNow.current,
            interpretation: energyNowResult.interpretation,
            retrievedAt: energyNowResult.energyNow.retrievedAt,
            isFixture: energyNowResult.energyNow.isFixture,
          }
        : null;

      const [greenRes, solarScoreRes] = await Promise.all([
        fetch("/api/scores/green", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            solarAssessment: assessment
              ? { annualIrradiationKwhPerM2: assessment.annualIrradiationKwhPerM2 }
              : undefined,
            carbonIntensity: energyNowResult
              ? {
                  currentIndex: energyNowResult.energyNow.current.index,
                  forecastValues: energyNowResult.energyNow.forecast.available
                    ? energyNowResult.energyNow.forecast.periods.map((p: any) => p.forecast)
                    : undefined,
                }
              : undefined,
          }),
        }),
        assessment
          ? fetch("/api/scores/solar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ solarAssessment: assessment }),
            })
          : Promise.resolve(null),
      ]);
      const greenData = greenRes.ok ? await greenRes.json() : { ok: false };
      const solarScoreData = solarScoreRes && solarScoreRes.ok ? await solarScoreRes.json() : null;
      const finalGreenScore = greenData.ok ? greenData.greenScore : null;
      const finalSolarScore = solarScoreData?.ok ? solarScoreData.solarScore : null;
      setGreenScore(finalGreenScore);
      setSolarScore(finalSolarScore);

      // 6. Top 3 recommendations
      const actionPlanRes = await fetch("/api/action-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          greenScore: finalGreenScore,
          solarScore: finalSolarScore,
          energyNow: energyNowForScoring,
        }),
      });
      const actionPlanData = actionPlanRes.ok ? await actionPlanRes.json() : null;
      const actions = actionPlanData?.ok ? actionPlanData.actionPlan.actions.slice(0, 3) : [];
      setTopActions(actions);

      // 9 (assembled here, shown at the end): data sources & assumptions
      const sources = new Set<string>();
      const assumptions = new Set<string>();
      [finalGreenScore, finalSolarScore].forEach((r) => {
        r?.dataSources?.forEach((s: string) => sources.add(s));
        r?.assumptions?.forEach((a: string) => assumptions.add(a));
      });
      setDataSourcesAndAssumptions({ sources: [...sources], assumptions: [...assumptions] });

      // 7-8. Ask the AI Advisor the fixed investor question
      setStep("advisor");
      const advisorRes = await fetch("/api/advisor/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groundingContext: {
            location: {
              postcodeOutward: locationData.location.postcodeOutward,
              region: locationData.location.region,
              adminDistrict: locationData.location.adminDistrict,
            },
            greenScore: finalGreenScore,
            solarScore: finalSolarScore,
            energyNow: energyNowForScoring,
            recommendations: actions,
          },
          question: DEMO_QUESTION,
        }),
      });
      const advisorData = await advisorRes.json();
      if (!advisorRes.ok || !advisorData.ok) {
        setErrorMessage(advisorData.message ?? "The AI Advisor is temporarily unavailable.");
        setStep("error");
        return;
      }
      setAdvisorAnswer(advisorData.answer);
      noteFixture(advisorData.isFixture);

      setStep("done");
    } catch {
      setErrorMessage("Could not reach the server. Check your connection and try again.");
      setStep("error");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      {usedFixtureData && (
        <div
          role="status"
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: 8,
            padding: "0.6rem 1rem",
            marginBottom: "1rem",
            fontWeight: 600,
          }}
        >
          Demo Mode — showing recorded example data, not a live result
        </div>
      )}

      <h1>CleanTech Advisor — Investor Demo</h1>
      <p style={{ color: "#555" }}>
        A representative UK postcode, run through the real GreenScore, SolarScore, Energy Now, and
        AI Advisor pipeline — the same one every other screen in this app uses. See{" "}
        <code>DEMO_SCRIPT.md</code> for the spoken walkthrough.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runDemo();
        }}
      >
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          aria-label="Demo postcode"
          style={{ padding: "0.5rem", width: "60%" }}
        />
        <button
          type="submit"
          disabled={step !== "idle" && step !== "done" && step !== "error"}
          style={{ marginLeft: "0.5rem", padding: "0.5rem 1rem" }}
        >
          {step === "idle" ? "Start Demo" : step === "done" || step === "error" ? "Run Again" : "Running…"}
        </button>
      </form>

      {step === "error" && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {errorMessage}
        </p>
      )}

      {location && (
        <Section title="1-2. Location">
          <p>
            {location.postcodeOutward}
            {location.region ? `, ${location.region}` : ""}
            {location.adminDistrict ? ` (${location.adminDistrict})` : ""}
          </p>
        </Section>
      )}

      {greenScore && (
        <Section title="3. GreenScore">
          <p style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>{greenScore.totalScore}/100</p>
          {greenScore.strengths.slice(0, 1).map((s: string) => (
            <p key={s} style={{ color: "#166534" }}>
              {s}
            </p>
          ))}
        </Section>
      )}

      {solarScore && (
        <Section title="4. SolarScore">
          <p>
            Suitability: <strong>{solarScore.suitability}</strong> — estimated{" "}
            {solarScore.annualGenerationKwh} kWh/year, {solarScore.emissionsReduction.annualKgCo2} kg
            CO2/year avoided.
          </p>
        </Section>
      )}

      {energyNow && (
        <Section title="5. Energy Now">
          <p>{energyNow.interpretation.currentSummary}</p>
          {energyNow.interpretation.flexibleUseSuggestion.available && (
            <p style={{ color: "#166534" }}>{energyNow.interpretation.flexibleUseSuggestion.message}</p>
          )}
        </Section>
      )}

      {topActions.length > 0 && (
        <Section title="6. Top 3 recommendations">
          <ol>
            {topActions.map((a) => (
              <li key={a.id}>{a.title}</li>
            ))}
          </ol>
        </Section>
      )}

      {advisorAnswer && (
        <Section title="7-8. AI Advisor">
          <p style={{ fontStyle: "italic", color: "#555" }}>&ldquo;{DEMO_QUESTION}&rdquo;</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{advisorAnswer}</p>
        </Section>
      )}

      {step === "done" && (
        <Section title="9. Data sources & assumptions">
          <ul style={{ fontSize: "0.85rem", color: "#555" }}>
            {dataSourcesAndAssumptions.sources.map((s) => (
              <li key={s}>Source: {s}</li>
            ))}
            {dataSourcesAndAssumptions.assumptions.map((a) => (
              <li key={a}>Assumption: {a}</li>
            ))}
          </ul>
        </Section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: "1.25rem", borderTop: "1px solid #e5e7eb", paddingTop: "1rem" }}>
      <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", color: "#888", letterSpacing: "0.05em" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
