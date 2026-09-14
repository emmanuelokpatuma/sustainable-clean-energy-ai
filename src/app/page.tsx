"use client";

import { useState } from "react";

type ScreenState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      location: {
        latitude: number;
        longitude: number;
        adminDistrict: string | null;
        region: string | null;
        postcodeOutward: string;
      };
    }
  | { status: "error"; message: string };

export default function LocationScreen() {
  const [postcode, setPostcode] = useState("");
  const [state, setState] = useState<ScreenState>({ status: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ status: "loading" });
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
      setState({ status: "success", location: data.location });
    } catch {
      setState({
        status: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>CleanTech Advisor</h1>
      <p>Enter your UK postcode to get started.</p>

      <form onSubmit={handleSubmit}>
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          placeholder="e.g. SW1A 1AA"
          aria-label="UK postcode"
          style={{ padding: "0.5rem", fontSize: "1rem", width: "100%" }}
        />
        <button
          type="submit"
          disabled={state.status === "loading"}
          style={{ marginTop: "0.75rem", padding: "0.5rem 1rem" }}
        >
          {state.status === "loading" ? "Checking…" : "Continue"}
        </button>
      </form>

      {state.status === "error" && (
        <p role="alert" style={{ color: "#b91c1c", marginTop: "1rem" }}>
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <div style={{ marginTop: "1rem" }}>
          <p>
            Location found: <strong>{state.location.postcodeOutward}</strong>
            {state.location.region ? `, ${state.location.region}` : ""}
          </p>
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            We'll use this to look up solar and electricity data for your area.
          </p>
        </div>
      )}
    </main>
  );
}
