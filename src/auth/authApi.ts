import { createAuthSession, type AuthSession } from "./authSession";

const INVALID_CREDENTIALS_MESSAGE = "The user ID or password is incorrect.";

export async function authenticateUser(
  userId: string,
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<AuthSession> {
  const normalizedUserId = userId.trim().normalize("NFKC").toLowerCase();
  const response = await fetchImpl("/api/v1/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: normalizedUserId, password })
  });

  if (response.status === 401) {
    throw new Error(INVALID_CREDENTIALS_MESSAGE);
  }
  if (!response.ok) {
    throw new Error("Sign in is temporarily unavailable.");
  }
  return parseSessionResponse(response);
}

export async function getAuthenticatedSession(
  fetchImpl: typeof fetch = fetch
): Promise<AuthSession | null> {
  const response = await fetchImpl("/api/v1/auth/session", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Session verification is temporarily unavailable.");
  return parseSessionResponse(response);
}

export async function logoutUser(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl("/api/v1/auth/logout", {
    method: "POST",
    credentials: "same-origin"
  });
  if (!response.ok) throw new Error("Sign out is temporarily unavailable.");
}

async function parseSessionResponse(response: Response): Promise<AuthSession> {
  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.userId !== "string" || !payload.userId.trim()) {
    throw new Error("Invalid authentication response.");
  }
  return createAuthSession(payload.userId.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
