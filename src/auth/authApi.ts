import { apiFetch, resetAuthRequiredNotification } from "./apiFetch";
import { parseAuthProfile, type AuthSession } from "./authSession";

const INVALID_CREDENTIALS_MESSAGE = "The user ID or password is incorrect.";
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const normalizeLogin = (value: string) => value.trim().normalize("NFKC").toLowerCase();

async function postProfile(path: string, body: Record<string, string>, fetchImpl: FetchLike): Promise<AuthSession> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  }, fetchImpl);
  if (response.status === 401) throw new Error(INVALID_CREDENTIALS_MESSAGE);
  if (!response.ok) throw new Error("Credential request is temporarily unavailable.");
  const profile = parseAuthProfile(await response.json());
  resetAuthRequiredNotification();
  return profile;
}

export function authenticateUser(userId: string, password: string, fetchImpl: FetchLike = fetch): Promise<AuthSession> {
  return postProfile("/api/v1/auth/login", { userId: normalizeLogin(userId), password }, fetchImpl);
}

export function activateUser(loginId: string, temporaryPassword: string, newPassword: string, fetchImpl: FetchLike = fetch): Promise<AuthSession> {
  return postProfile("/api/v1/auth/activate", { loginId: normalizeLogin(loginId), temporaryPassword, newPassword }, fetchImpl);
}

export function completePasswordReset(loginId: string, temporaryPassword: string, newPassword: string, fetchImpl: FetchLike = fetch): Promise<AuthSession> {
  return postProfile("/api/v1/auth/reset-complete", { loginId: normalizeLogin(loginId), temporaryPassword, newPassword }, fetchImpl);
}

export async function changePassword(currentPassword: string, newPassword: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const response = await apiFetch("/api/v1/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword })
  }, fetchImpl);
  if (response.status === 401) throw new Error("The current password is incorrect or the session has expired.");
  if (!response.ok) throw new Error("Password change is temporarily unavailable.");
}

export async function getAuthenticatedSession(fetchImpl: FetchLike = fetch): Promise<AuthSession | null> {
  const response = await apiFetch("/api/v1/auth/session", { method: "GET", headers: { Accept: "application/json" } }, fetchImpl);
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Session verification is temporarily unavailable.");
  const profile = parseAuthProfile(await response.json());
  resetAuthRequiredNotification();
  return profile;
}

export async function logoutUser(fetchImpl: FetchLike = fetch): Promise<void> {
  const response = await apiFetch("/api/v1/auth/logout", { method: "POST" }, fetchImpl);
  if (!response.ok) throw new Error("Sign out is temporarily unavailable.");
  resetAuthRequiredNotification();
}
