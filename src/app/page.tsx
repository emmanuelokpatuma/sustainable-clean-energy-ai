"use client";

import { useState } from "react";

interface LocationData {
  latitude: number;
  longitude: number;
  adminDistrict: string | null;
  region: string | null;
  postcodeOutward: string;
}

type ScreenState =
  | { status: "idle" }
  | { status: "loading"; step?: string }
  | { status: "house_entry"; location: LocationData }
  | { status: "property_selected"; location: LocationData; property: string }
  | { status: "error"; message: string };

export default function LocationScreen() {
  const [postcode, setPostcode] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [state, setState] = useState<ScreenState>({ status: "idle" });

  async function handlePostcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ status: "loading", step: "Resolving postcode..." });

    try {
      const res = await fetch("/api/location/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setState({
          status: "error",
          message: data.message ?? "Something went wrong.",
        });
        return;
      }

      setState({
        status: "house_entry",
        location: data.location,
      });
    } catch {
      setState({
        status: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    }
  }

  function handlePropertySubmit(e: React.FormEvent) {
    e.preventDefault();

    if (state.status !== "house_entry") return;

    const propertyValue = houseNumber.trim();
    const label = propertyValue ? `${propertyValue}, ${postcode.trim().toUpperCase()}` : postcode.trim().toUpperCase();

    setState({
      status: "property_selected",
      location: state.location,
      property: label,
    });
  }

  function handleReset() {
    setPostcode("");
    setHouseNumber("");
    setState({ status: "idle" });
  }

  return (
    <main className="location-page">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <section className="location-card">
        <div className="brand-wrap">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            CleanTech Advisor
          </div>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">Smarter homes. Cleaner energy.</p>
          <h1 className="location-title">See your home&apos;s energy potential.</h1>
          <p className="location-subtitle">
            Discover solar opportunities, energy efficiency upgrades, and the smartest next step for your property.
          </p>
        </div>

        {state.status !== "property_selected" && state.status !== "house_entry" && (
          <div className="stats-row" aria-label="Key benefits">
            <div className="stat-pill">
              <strong>Solar</strong>
              <span>Optimised</span>
            </div>
            <div className="stat-pill">
              <strong>Carbon</strong>
              <span>Lowered</span>
            </div>
            <div className="stat-pill">
              <strong>Savings</strong>
              <span>Forecasted</span>
            </div>
          </div>
        )}

        {(state.status === "idle" || state.status === "error") && (
          <form onSubmit={handlePostcodeSubmit} className="location-form">
            <div className="input-shell">
              <label htmlFor="postcode" className="sr-only">
                Enter your UK postcode
              </label>
              <input
                id="postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Enter your UK postcode"
                aria-label="UK postcode"
                className="location-input"
              />
            </div>

            <button type="submit" className="primary-button">
              Get my recommendations
            </button>
          </form>
        )}

        {state.status === "loading" && (
          <div style={{ textAlign: "center", marginTop: "1.5rem", color: "#475467" }}>
            <p style={{ margin: 0, fontSize: "0.95rem" }}>{state.step || "Loading…"}</p>
          </div>
        )}

        {state.status === "house_entry" && (
          <form onSubmit={handlePropertySubmit} className="location-form">
            <div className="success-panel" style={{ marginBottom: "1rem" }}>
              <p className="status-text">
                Location found: <strong>{state.location.postcodeOutward}</strong>
                {state.location.region ? `, ${state.location.region}` : ""}
              </p>
            </div>

            <div className="input-shell">
              <label htmlFor="houseNumber" className="sr-only">
                Enter your house or flat number
              </label>
              <input
                id="houseNumber"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                placeholder="House / flat number (optional)"
                aria-label="House or flat number"
                className="location-input"
              />
            </div>

            <button type="submit" className="primary-button">
              Continue
            </button>
          </form>
        )}

        {state.status === "property_selected" && (
          <div className="success-panel">
            <p className="status-text">
              Location found: <strong>{state.location.postcodeOutward}</strong>
              {state.location.region ? `, ${state.location.region}` : ""}
            </p>
            <p className="inline-note">
              Property: <strong>{state.property}</strong>
            </p>
            <button
              onClick={handleReset}
              style={{
                marginTop: "1rem",
                background: "transparent",
                border: "1px solid rgba(15, 118, 110, 0.3)",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                color: "#0f766e",
                cursor: "pointer",
                fontSize: "0.9rem",
                fontWeight: "600",
              }}
            >
              Change postcode
            </button>
          </div>
        )}

        {state.status === "error" && (
          <div className="error-panel" role="alert">
            <p className="error-text">{state.message}</p>
          </div>
        )}

        {(state.status === "idle" || state.status === "error") && (
          <p className="mini-note">
            Live recommendations for <strong>HG3</strong>, Yorkshire and The Humber.
          </p>
        )}
      </section>
    </main>
  );
}
