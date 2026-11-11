import React, { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { saveSession, readApiError } from "../lib/auth";
import type { AuthSessionResponse } from "../lib/auth-types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(bootstrapMode ? "/api/auth/bootstrap" : "/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(bootstrapMode ? { email, password, bootstrapToken } : { email, password }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Authentication failed."));
      const session = await response.json() as AuthSessionResponse;
      saveSession(session);
      await router.replace(session.user.roles.includes("admin") ? "/admin" : "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 520, padding: "3rem 1rem" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 800 }}>Sign in to PolyFind</h1>
      <p style={{ color: "var(--text-secondary)", margin: "0.5rem 0 1.5rem" }}>
        Customers can browse publicly. Administrator access is required to change the shared catalogue.
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: "1rem", background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 12, padding: "1.25rem" }}>
        <label>Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} /></label>
        <label>Password<input required type="password" autoComplete={bootstrapMode ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} /></label>
        {bootstrapMode && <label>One-time administrator bootstrap token<input required type="password" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} style={fieldStyle} /></label>}
        {error && <p role="alert" style={{ color: "var(--error-text)" }}>{error}</p>}
        <button className="search-submit-btn" disabled={busy} type="submit">{busy ? "Please wait…" : bootstrapMode ? "Create first administrator" : "Sign in"}</button>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem", fontSize: "0.9rem" }}>
        <Link href="/register">Create a customer account</Link>
        <button type="button" onClick={() => { setBootstrapMode(!bootstrapMode); setError(""); }} style={{ background: "none", border: 0, color: "var(--text-secondary)", textDecoration: "underline", cursor: "pointer" }}>
          {bootstrapMode ? "Return to sign in" : "First-time administrator setup"}
        </button>
      </div>
    </main>
  );
}

const fieldStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.7rem", marginTop: "0.35rem", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)" };
