import { apiFetch, resetAuthRequiredNotification } from "./apiFetch";
import { parseAuthProfile, type AuthSession } from "./authSession";

const INVALID_CREDENTIALS_MESSAGE = "The user ID or password is incorrect.";
const INVALID_ACTION_LINK_MESSAGE = "This action link is invalid, expired, or already used.";
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type CredentialActionPurpose = "ACTIVATION" | "RESET";
export type CredentialActionContext = Readonly<{
  loginId: string;
  purpose: CredentialActionPurpose;
  expiresAt: string;
}>;

const normalizeLogin = (value: string) => value.trim().normalize("NFKC").toLowerCase();

async function postProfile(path: string, body: Record<string, string>, fetchImpl: FetchLike,
  unauthorizedMessage = INVALID_CREDENTIALS_MESSAGE): Promise<AuthSession> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  }, fetchImpl);
  if (response.status === 401) throw new Error(unauthorizedMessage);
  if (!response.ok) throw new Error("Credential request is temporarily unavailable.");
  const profile = parseAuthProfile(await response.json());
  resetAuthRequiredNotification();
  return profile;
}

export function authenticateUser(userId: string, password: string, fetchImpl: FetchLike = fetch): Promise<AuthSession> {
  return postProfile("/api/v1/auth/login", { userId: normalizeLogin(userId), password }, fetchImpl);
}

export async function inspectCredentialAction(token: string, fetchImpl: FetchLike = fetch): Promise<CredentialActionContext> {
  const response = await apiFetch("/api/v1/auth/action-token/inspect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token })
  }, fetchImpl);
  if (response.status === 401) throw new Error(INVALID_ACTION_LINK_MESSAGE);
  if (!response.ok) throw new Error("Credential link validation is temporarily unavailable.");
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null) throw new Error("Invalid credential link response.");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.loginId !== "string" || !["ACTIVATION", "RESET"].includes(String(candidate.purpose))
      || typeof candidate.expiresAt !== "string" || Number.isNaN(Date.parse(candidate.expiresAt))) {
    throw new Error("Invalid credential link response.");
  }
  return { loginId: candidate.loginId, purpose: candidate.purpose as CredentialActionPurpose, expiresAt: candidate.expiresAt };
}

export function completeCredentialAction(purpose: CredentialActionPurpose, token: string, newPassword: string,
  fetchImpl: FetchLike = fetch): Promise<AuthSession> {
  const path = purpose === "ACTIVATION" ? "/api/v1/auth/activate" : "/api/v1/auth/reset-complete";
  return postProfile(path, { token, newPassword }, fetchImpl, INVALID_ACTION_LINK_MESSAGE);
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
