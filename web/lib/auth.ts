import type { AuthSession } from "./auth-types";

const SESSION_KEY = "polyfind.session.token";

export function saveSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_KEY, session.token);
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_KEY);
}

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(SESSION_KEY);
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(input, { ...init, headers });
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
