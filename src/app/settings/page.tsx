"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
}

interface Property {
  id: string;
  label: string | null;
  location: { postcodeOutward: string; region: string | null };
  createdAt: string;
}

type AuthMode = "login" | "signup";

export default function SettingsScreen() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = still checking
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [properties, setProperties] = useState<Property[]>([]);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.ok ? data.user : null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/properties")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setProperties(data.properties);
      })
      .catch(() => {});
  }, [user]);

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setAuthError(data.message ?? "Something went wrong.");
        return;
      }
      setUser(data.user);
      setPassword("");
    } catch {
      setAuthError("Could not reach the server. Check your connection and try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setProperties([]);
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDeleteError(data.message ?? "Something went wrong.");
        return;
      }
      setUser(null);
      setProperties([]);
      setConfirmingDelete(false);
    } catch {
      setDeleteError("Could not reach the server. Check your connection and try again.");
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1>Settings &amp; Data / Privacy</h1>

      {user === undefined && <p>Checking your account…</p>}

      {user === null && (
        <>
          <p style={{ color: "#555" }}>
            Sign in or create an account to save properties and see your GreenScore over time.
          </p>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
            <button onClick={() => setAuthMode("login")} style={{ fontWeight: authMode === "login" ? 700 : 400 }}>
              Log in
            </button>
            <button onClick={() => setAuthMode("signup")} style={{ fontWeight: authMode === "signup" ? 700 : 400 }}>
              Sign up
            </button>
          </div>
          <form onSubmit={submitAuth}>
            <div style={{ marginBottom: "0.5rem" }}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email"
                style={{ padding: "0.5rem", width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={authMode === "signup" ? "At least 10 characters" : "Password"}
                aria-label="Password"
                style={{ padding: "0.5rem", width: "100%", boxSizing: "border-box" }}
              />
            </div>
            {authError && (
              <p role="alert" style={{ color: "#b91c1c" }}>
                {authError}
              </p>
            )}
            <button type="submit" disabled={authBusy} style={{ padding: "0.5rem 1rem" }}>
              {authBusy ? "Working…" : authMode === "login" ? "Log in" : "Sign up"}
            </button>
          </form>
          <p style={{ fontSize: "0.8rem", color: "#999", marginTop: "1rem" }}>
            We only ever ask for an email and password to create an account — never a name or address.
            Passwords are hashed and never stored in plain text.
          </p>
        </>
      )}

      {user && (
        <>
          <section style={{ marginBottom: "1.5rem" }}>
            <p>
              Signed in as <strong>{user.email}</strong>
            </p>
            <button onClick={logOut} style={{ padding: "0.4rem 0.8rem" }}>
              Log out
            </button>
          </section>

          <section style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem" }}>Your saved properties</h2>
            {properties.length === 0 ? (
              <p style={{ color: "#777" }}>No properties saved yet.</p>
            ) : (
              <ul style={{ paddingLeft: "1.2rem" }}>
                {properties.map((p) => (
                  <li key={p.id}>
                    {p.label ?? p.location.postcodeOutward} — {p.location.postcodeOutward}
                    {p.location.region ? `, ${p.location.region}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ background: "#f8fafc", borderRadius: 8, padding: "1rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem" }}>What we store and why</h2>
            <ul style={{ paddingLeft: "1.2rem", fontSize: "0.9rem", color: "#444" }}>
              <li>Your email and a hashed password — to identify your account.</li>
              <li>
                For each saved property: the outward part of its postcode (e.g. &apos;SW1A&apos;, never the full
                postcode) and coordinates — used to look up solar and electricity data for that area.
              </li>
              <li>GreenScore results you save, so you can see how they change over time.</li>
            </ul>
            <p style={{ fontSize: "0.85rem", color: "#666" }}>
              We never send your name, full postcode, or account details to the AI Advisor — only the
              already-computed results above. See our <code>PRIVACY.md</code> for full detail.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1rem", color: "#b91c1c" }}>Delete your account</h2>
            <p style={{ fontSize: "0.9rem", color: "#555" }}>
              This permanently deletes your account, saved properties, and all GreenScore history. This
              cannot be undone.
            </p>
            {!confirmingDelete ? (
              <button onClick={() => setConfirmingDelete(true)} style={{ padding: "0.4rem 0.8rem" }}>
                Delete my account and all data
              </button>
            ) : (
              <form onSubmit={deleteAccount}>
                <input
                  type="password"
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Confirm your password"
                  aria-label="Confirm password to delete account"
                  style={{ padding: "0.5rem", marginRight: "0.5rem" }}
                />
                <button type="submit" style={{ padding: "0.5rem 1rem", background: "#b91c1c", color: "white" }}>
                  Confirm deletion
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} style={{ marginLeft: "0.5rem" }}>
                  Cancel
                </button>
                {deleteError && (
                  <p role="alert" style={{ color: "#b91c1c" }}>
                    {deleteError}
                  </p>
                )}
              </form>
            )}
          </section>
        </>
      )}
    </main>
  );
}
