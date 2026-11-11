import React, { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { saveSession, readApiError } from "../lib/auth";
import type { AuthSessionResponse } from "../lib/auth-types";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Account registration failed."));
      const session = await response.json() as AuthSessionResponse;
      saveSession(session);
      await router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 520, padding: "3rem 1rem" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 800 }}>Create a customer account</h1>
      <p style={{ color: "var(--text-secondary)", margin: "0.5rem 0 1.5rem" }}>Use at least 12 characters for your password. Customer accounts cannot modify the shared catalogue.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: "1rem", background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 12, padding: "1.25rem" }}>
        <label>Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} /></label>
        <label>Password<input required minLength={12} maxLength={256} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} /></label>
        {error && <p role="alert" style={{ color: "var(--error-text)" }}>{error}</p>}
        <button className="search-submit-btn" disabled={busy} type="submit">{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p style={{ marginTop: "1rem" }}>Already registered? <Link href="/login">Sign in</Link></p>
    </main>
  );
}

const fieldStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.7rem", marginTop: "0.35rem", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)" };
