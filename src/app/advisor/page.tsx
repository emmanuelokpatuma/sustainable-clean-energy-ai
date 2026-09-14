"use client";

import { useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type PipelineState =
  | { status: "idle" }
  | { status: "loading"; step: string }
  | { status: "error"; message: string }
  | { status: "ready"; groundingContext: any; summary: string[] };

/**
 * Demonstrates the full Phase 1-7 pipeline end to end: a postcode resolves
 * to coordinates (Phase 1), which feed a solar assessment (Phase 3) and the
 * national Energy Now data (Phase 2/6), which together feed a GreenScore
 * (Phase 4) and SolarScore (Phase 5) — and the AI Advisor (Phase 7) then
 * answers questions grounded in all of it.
 *
 * There is no persistence yet (Phase 9), so this pipeline re-runs from
 * scratch each time the postcode form is submitted, and the assembled
 * context lives only in this component's state for the duration of the chat.
 */
export default function AdvisorScreen() {
  const [postcode, setPostcode] = useState("");
  const [pipeline, setPipeline] = useState<PipelineState>({ status: "idle" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  async function runPipeline(e: React.FormEvent) {
    e.preventDefault();
    setMessages([]);
    setPipeline({ status: "loading", step: "Resolving postcode…" });

    try {
      const locationRes = await fetch("/api/location/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode }),
      });
      const locationData = await locationRes.json();
      if (!locationRes.ok || !locationData.ok) {
        setPipeline({ status: "error", message: locationData.message ?? "Could not resolve that postcode." });
        return;
      }
      const location = locationData.location;

      setPipeline({ status: "loading", step: "Checking solar potential…" });
      const solarRes = await fetch("/api/solar/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: location.latitude, longitude: location.longitude }),
      });
      const solarData = await solarRes.json();
      const solarAssessment = solarRes.ok && solarData.ok ? solarData.solarAssessment : null;

      setPipeline({ status: "loading", step: "Checking current electricity carbon intensity…" });
      const energyRes = await fetch("/api/energy/current");
      const energyData = await energyRes.json();
      const energyNow = energyRes.ok && energyData.ok ? energyData : null;

      setPipeline({ status: "loading", step: "Calculating GreenScore and SolarScore…" });
      const [greenRes, solarScoreRes] = await Promise.all([
        fetch("/api/scores/green", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            solarAssessment: solarAssessment
              ? { annualIrradiationKwhPerM2: solarAssessment.annualIrradiationKwhPerM2 }
              : undefined,
            carbonIntensity: energyNow
              ? {
                  currentIndex: energyNow.energyNow.current.index,
                  forecastValues: energyNow.energyNow.forecast.available
                    ? energyNow.energyNow.forecast.periods.map((p: any) => p.forecast)
                    : undefined,
                }
              : undefined,
          }),
        }),
        solarAssessment
          ? fetch("/api/scores/solar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ solarAssessment }),
            })
          : Promise.resolve(null),
      ]);

      const greenData = greenRes.ok ? await greenRes.json() : { ok: false };
      const solarScoreData = solarScoreRes && solarScoreRes.ok ? await solarScoreRes.json() : null;

      const energyNowForContext = energyNow
        ? {
            current: energyNow.energyNow.current,
            interpretation: energyNow.interpretation,
            retrievedAt: energyNow.energyNow.retrievedAt,
            isFixture: energyNow.energyNow.isFixture,
          }
        : null;

      setPipeline({ status: "loading", step: "Building your action plan…" });
      const actionPlanRes = await fetch("/api/action-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          greenScore: greenData.ok ? greenData.greenScore : null,
          solarScore: solarScoreData?.ok ? solarScoreData.solarScore : null,
          energyNow: energyNowForContext,
        }),
      });
      const actionPlanData = actionPlanRes.ok ? await actionPlanRes.json() : null;

      const groundingContext = {
        location: {
          postcodeOutward: location.postcodeOutward,
          region: location.region,
          adminDistrict: location.adminDistrict,
        },
        greenScore: greenData.ok ? greenData.greenScore : null,
        solarScore: solarScoreData?.ok ? solarScoreData.solarScore : null,
        energyNow: energyNowForContext,
        recommendations: actionPlanData?.ok ? actionPlanData.actionPlan.actions : null,
      };

      const summary = [
        `Location: ${location.postcodeOutward}${location.region ? `, ${location.region}` : ""}`,
        groundingContext.greenScore
          ? `GreenScore: ${groundingContext.greenScore.totalScore}/100`
          : "GreenScore: not available",
        groundingContext.solarScore
          ? `SolarScore: ${groundingContext.solarScore.suitability} suitability`
          : "SolarScore: not available",
        groundingContext.energyNow
          ? `Energy now: ${groundingContext.energyNow.interpretation.currentSummary}`
          : "Energy now: not available",
        groundingContext.recommendations && groundingContext.recommendations.length > 0
          ? `Top recommendation: ${groundingContext.recommendations[0].title}`
          : "Recommendations: none generated (not enough data)",
      ];

      setPipeline({ status: "ready", groundingContext, summary });
    } catch {
      setPipeline({ status: "error", message: "Could not reach the server. Check your connection and try again." });
    }
  }

  async function sendQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (pipeline.status !== "ready" || !question.trim()) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(newMessages);
    setQuestion("");
    setAsking(true);
    setAskError(null);

    try {
      const res = await fetch("/api/advisor/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groundingContext: pipeline.groundingContext,
          conversationHistory: messages,
          question,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAskError(data.message ?? "Something went wrong.");
        return;
      }
      setMessages([...newMessages, { role: "assistant", content: data.answer }]);
    } catch {
      setAskError("Could not reach the server. Check your connection and try again.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: "3rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1>AI Sustainability Advisor</h1>
      <p style={{ color: "#555" }}>
        Enter a UK postcode to pull together your GreenScore, SolarScore, and current electricity
        conditions, then ask questions about what they mean for you.
      </p>

      <form onSubmit={runPipeline}>
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          placeholder="e.g. SW1A 1AA"
          aria-label="UK postcode"
          style={{ padding: "0.5rem", fontSize: "1rem", width: "70%" }}
        />
        <button
          type="submit"
          disabled={pipeline.status === "loading"}
          style={{ marginLeft: "0.5rem", padding: "0.5rem 1rem" }}
        >
          {pipeline.status === "loading" ? "Working…" : "Go"}
        </button>
      </form>

      {pipeline.status === "loading" && <p style={{ color: "#555" }}>{pipeline.step}</p>}
      {pipeline.status === "error" && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {pipeline.message}
        </p>
      )}

      {pipeline.status === "ready" && (
        <>
          <section style={{ background: "#f8fafc", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
            {pipeline.summary.map((line) => (
              <p key={line} style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
                {line}
              </p>
            ))}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  margin: "0.5rem 0",
                  padding: "0.6rem 0.8rem",
                  borderRadius: 8,
                  background: m.role === "user" ? "#eff6ff" : "#f0fdf4",
                  maxWidth: "85%",
                  marginLeft: m.role === "user" ? "auto" : 0,
                }}
              >
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.content}</p>
              </div>
            ))}
            {askError && (
              <p role="alert" style={{ color: "#b91c1c" }}>
                {askError}
              </p>
            )}
          </section>

          <form onSubmit={sendQuestion} style={{ marginTop: "1rem" }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What should I do first?"
              aria-label="Ask the advisor"
              style={{ padding: "0.5rem", fontSize: "1rem", width: "70%" }}
            />
            <button type="submit" disabled={asking} style={{ marginLeft: "0.5rem", padding: "0.5rem 1rem" }}>
              {asking ? "Thinking…" : "Ask"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
