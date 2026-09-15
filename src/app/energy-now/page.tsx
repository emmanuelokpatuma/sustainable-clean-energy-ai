"use client";

import { useEffect, useState } from "react";

interface Period {
  from: string;
  to: string;
  forecast: number | null;
  actual: number | null;
  index: string;
}

interface EnergyNowData {
  current: Period;
  forecast: { available: true; periods: Period[] } | { available: false; reason: string };
  generationMix:
    | { available: true; mix: { fuel: string; percentage: number }[] }
    | { available: false; reason: string };
  source: string;
  retrievedAt: string;
  isFixture: boolean;
}

interface Interpretation {
  currentSummary: string;
  currentIndex: string;
  flexibleUseSuggestion:
    | {
        available: true;
        from: string;
        to: string;
        timingLabel: string;
        forecastGCo2PerKwh: number;
        index: string;
        message: string;
      }
    | { available: false; reason: string };
  essentialServicesCaveat: string;
  forecastDisclaimer: string;
}

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; energyNow: EnergyNowData; interpretation: Interpretation };

const INDEX_COLOR: Record<string, string> = {
  "very low": "#15803d",
  low: "#4d7c0f",
  moderate: "#a16207",
  high: "#c2410c",
  "very high": "#b91c1c",
};

function formatTime(iso: string): string {
  // API timestamps look like "2026-09-14T11:30Z" — Date parses this fine.
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function EnergyNowScreen() {
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const res = await fetch("/api/energy/current");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setState({ status: "error", message: data.message ?? "Something went wrong." });
          return;
        }
        setState({ status: "success", energyNow: data.energyNow, interpretation: data.interpretation });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Could not reach the server. Check your connection and try again.",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1>Energy Now</h1>
      <p style={{ color: "#555" }}>What&apos;s happening with electricity right now.</p>

      {state.status === "loading" && <p>Checking current grid conditions…</p>}

      {state.status === "error" && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <>
          <section
            style={{
              border: `2px solid ${INDEX_COLOR[state.interpretation.currentIndex] ?? "#555"}`,
              borderRadius: 8,
              padding: "1rem",
              marginTop: "1rem",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>{state.interpretation.currentSummary}</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", color: "#555" }}>
              Current index: <strong>{state.interpretation.currentIndex}</strong>
              {state.energyNow.current.actual !== null &&
                ` (${state.energyNow.current.actual} gCO2/kWh)`}
            </p>
          </section>

          <section style={{ marginTop: "1rem" }}>
            {state.interpretation.flexibleUseSuggestion.available ? (
              <div style={{ padding: "0.75rem", background: "#f0fdf4", borderRadius: 8 }}>
                <p style={{ margin: 0 }}>{state.interpretation.flexibleUseSuggestion.message}</p>
              </div>
            ) : (
              <p style={{ color: "#777", fontSize: "0.9rem" }}>
                {state.interpretation.flexibleUseSuggestion.reason}
              </p>
            )}
            <p style={{ fontSize: "0.8rem", color: "#999", marginTop: "0.5rem" }}>
              {state.interpretation.essentialServicesCaveat}
            </p>
            <p style={{ fontSize: "0.8rem", color: "#999" }}>{state.interpretation.forecastDisclaimer}</p>
          </section>

          {state.energyNow.generationMix.available && (
            <section style={{ marginTop: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem" }}>Current generation mix</h2>
              <ul style={{ paddingLeft: "1.2rem", margin: 0 }}>
                {state.energyNow.generationMix.mix
                  .slice()
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((m) => (
                    <li key={m.fuel}>
                      {m.fuel}: {m.percentage}%
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section style={{ marginTop: "1.5rem" }}>
            <button
              onClick={() => setShowWhy((v) => !v)}
              style={{ background: "none", border: "1px solid #ccc", borderRadius: 6, padding: "0.4rem 0.8rem", cursor: "pointer" }}
            >
              {showWhy ? "Hide" : "Why?"}
            </button>
            {showWhy && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#444" }}>
                <p>
                  Current period: {formatTime(state.energyNow.current.from)}–
                  {formatTime(state.energyNow.current.to)}, forecast{" "}
                  {state.energyNow.current.forecast ?? "n/a"} gCO2/kWh, actual{" "}
                  {state.energyNow.current.actual ?? "not yet available"} gCO2/kWh.
                </p>
                {state.energyNow.forecast.available ? (
                  <p>
                    Forecast periods considered: {state.energyNow.forecast.periods.length}, spanning{" "}
                    {formatTime(state.energyNow.forecast.periods[0]?.from ?? state.energyNow.current.to)} to{" "}
                    {formatTime(
                      state.energyNow.forecast.periods[state.energyNow.forecast.periods.length - 1]?.to ??
                        state.energyNow.current.to
                    )}
                    .
                  </p>
                ) : (
                  <p>Forecast unavailable: {state.energyNow.forecast.reason}</p>
                )}
                <p>
                  Source: {state.energyNow.source} · Retrieved:{" "}
                  {new Date(state.energyNow.retrievedAt).toLocaleString()}
                  {state.energyNow.isFixture && " · (demo/fixture data)"}
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
