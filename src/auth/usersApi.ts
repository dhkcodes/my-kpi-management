import { apiFetch } from "./apiFetch";
import { parseAuthProfile, type AuthSession, type UserAccess } from "./authSession";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type InviteUserRequest = Readonly<{
  displayName: string;
  loginId: string;
  access: UserAccess;
  temporaryPassword: string;
}>;

async function request(path: string, init: RequestInit, fetchImpl: FetchLike): Promise<Response> {
  const response = await apiFetch(`/api/v1/users${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) }
  }, fetchImpl);
  if (!response.ok) {
    let message = `User request failed (${response.status}).`;
    try {
      const body = await response.json() as { message?: unknown };
      if (typeof body.message === "string" && body.message.trim()) message = body.message;
    } catch { /* Keep sanitized fallback. */ }
    throw new Error(message);
  }
  return response;
}

export async function listUsers(fetchImpl: FetchLike = fetch): Promise<AuthSession[]> {
  const response = await request("", { method: "GET" }, fetchImpl);
  const payload: unknown = await response.json();
  const items = Array.isArray(payload) ? payload : (
    typeof payload === "object" && payload !== null && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items : null
  );
  if (!items) throw new Error("Invalid users response.");
  return items.map(parseAuthProfile);
}

export async function inviteUser(invite: InviteUserRequest, fetchImpl: FetchLike = fetch): Promise<void> {
  await request("/invite", { method: "POST", body: JSON.stringify({ ...invite, loginId: invite.loginId.trim().normalize("NFKC").toLowerCase() }) }, fetchImpl);
}

const passwordAction = async (userKey: string, action: "reissue" | "reset-password", temporaryPassword: string, fetchImpl: FetchLike) => {
  await request(`/${encodeURIComponent(userKey)}/${action}`, { method: "POST", body: JSON.stringify({ temporaryPassword }) }, fetchImpl);
};
const stateAction = async (userKey: string, action: string, fetchImpl: FetchLike) => {
  await request(`/${encodeURIComponent(userKey)}/${action}`, { method: "POST", body: JSON.stringify({}) }, fetchImpl);
};

export const reissueUserInvite = (key: string, temporaryPassword: string, fetchImpl: FetchLike = fetch) => passwordAction(key, "reissue", temporaryPassword, fetchImpl);
export const resetUserPassword = (key: string, temporaryPassword: string, fetchImpl: FetchLike = fetch) => passwordAction(key, "reset-password", temporaryPassword, fetchImpl);
export const cancelUserInvite = (key: string, fetchImpl: FetchLike = fetch) => stateAction(key, "cancel", fetchImpl);
export const lockUser = (key: string, fetchImpl: FetchLike = fetch) => stateAction(key, "lock", fetchImpl);
export const unlockUser = (key: string, fetchImpl: FetchLike = fetch) => stateAction(key, "unlock", fetchImpl);
export const enableUser = (key: string, fetchImpl: FetchLike = fetch) => stateAction(key, "enable", fetchImpl);
export const disableUser = (key: string, fetchImpl: FetchLike = fetch) => stateAction(key, "disable", fetchImpl);
