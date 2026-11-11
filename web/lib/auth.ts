import type { AuthSessionResponse } from "./auth-types";

/** Browser authentication uses an HttpOnly SameSite session cookie. */
export function saveSession(_session: AuthSessionResponse): void {
  // The API sets the HttpOnly cookie; JavaScript deliberately cannot read it.
}

export function clearSession(): void {
  // The logout endpoint revokes and clears the HttpOnly cookie.
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(input, { ...init, credentials: "same-origin", headers });
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
