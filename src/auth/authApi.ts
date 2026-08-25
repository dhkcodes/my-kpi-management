import type { AuthSession } from "./authSession";

const INVALID_CREDENTIALS_MESSAGE = "The user ID or password is incorrect.";

export async function authenticateUser(
  userId: string,
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<AuthSession> {
  const normalizedUserId = userId.trim().normalize("NFKC").toLowerCase();
  const response = await fetchImpl("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: normalizedUserId, password })
  });

  if (response.status === 401) throw new Error(INVALID_CREDENTIALS_MESSAGE);
  if (!response.ok) throw new Error("Sign in is temporarily unavailable.");

  const body: unknown = await response.json();
  if (!isLoginResponse(body)) throw new Error("Authentication API returned an invalid response.");
  return {
    version: 1,
    userId: body.userId,
    authenticatedAt: new Date().toISOString()
  };
}

function isLoginResponse(value: unknown): value is Readonly<{ userId: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(candidate).length === 1
    && typeof candidate.userId === "string"
    && candidate.userId.length > 0
    && candidate.userId.length <= 254;
}
