import assert from "node:assert/strict";
import {
  authenticateUser,
  changePassword,
  completeCredentialAction,
  getAuthenticatedSession,
  inspectCredentialAction,
  requestPasswordReset
} from "../src/auth/authApi";
import { apiFetch, resetAuthRequiredNotification, subscribeAuthRequired } from "../src/auth/apiFetch";
import { validatePasswordPolicy } from "../src/auth/passwordPolicy";
import {
  cancelUserInvite, disableUser, enableUser, inviteUser, listUsers, lockUser,
  reissueUserInvite, resetUserPassword, unlockUser
} from "../src/auth/usersApi";

const profile = {
  userKey: "user-1",
  displayName: "Ada Admin",
  loginId: "ada@example.com",
  access: "Admin" as const,
  status: "ACTIVE" as const
};
const action = { user: profile, actionToken: "signed.action-token", expiresAt: "2026-08-27T00:00:00Z", purpose: "ACTIVATION" as const };

async function main() {
  assert.match(validatePasswordPolicy("short") ?? "", /12 characters/);
  assert.match(validatePasswordPolicy("alllowercase12") ?? "", /uppercase/);
  assert.match(validatePasswordPolicy("ALLUPPERCASE12") ?? "", /lowercase/);
  assert.match(validatePasswordPolicy("NoNumbersHere") ?? "", /number/);
  assert.equal(validatePasswordPolicy("ValidPassword1"), null);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const jsonFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/action-token/inspect")) {
      return new Response(JSON.stringify({ loginId: profile.loginId, purpose: "ACTIVATION", expiresAt: action.expiresAt }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(profile), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const signedIn = await authenticateUser("  ADA@EXAMPLE.COM ", "secret", jsonFetch);
  assert.deepEqual(signedIn, profile);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { userId: "ada@example.com", password: "secret" });
  assert.equal(calls[0].init?.credentials, "include");
  assert.deepEqual(await getAuthenticatedSession(jsonFetch), profile);

  assert.equal((await inspectCredentialAction("signed.action-token", jsonFetch)).purpose, "ACTIVATION");
  await completeCredentialAction("ACTIVATION", "signed.action-token", "replacement-password", "replacement-password", jsonFetch);
  assert.deepEqual(JSON.parse(String(calls[calls.length - 1]?.init?.body)), {
    token: "signed.action-token", newPassword: "replacement-password", confirmPassword: "replacement-password"
  });
  assert.equal(calls[calls.length - 1]?.url, "/api/v1/auth/activate");
  await completeCredentialAction("RESET", "signed.reset-token", "replacement-password", "replacement-password", jsonFetch);
  assert.equal(calls[calls.length - 1]?.url, "/api/v1/auth/reset-complete");
  await changePassword("current", "replacement", "replacement", jsonFetch);
  assert.equal(calls[calls.length - 1]?.url, "/api/v1/auth/change-password");
  await requestPasswordReset("  ADA@EXAMPLE.COM ", jsonFetch);
  assert.equal(calls[calls.length - 1]?.url, "/api/v1/auth/forgot-password");
  assert.deepEqual(JSON.parse(String(calls[calls.length - 1]?.init?.body)), { loginId: "ada@example.com" });

  let authRequiredCount = 0;
  const unsubscribe = subscribeAuthRequired(() => { authRequiredCount += 1; });
  resetAuthRequiredNotification();
  const unauthorized: typeof fetch = async () => new Response(null, { status: 401 });
  await apiFetch("/api/v1/anything", undefined, unauthorized);
  await apiFetch("/api/v1/anything-else", undefined, unauthorized);
  assert.equal(authRequiredCount, 1, "one auth-required notification is emitted for an expiry episode");
  unsubscribe();

  const usersFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (init?.method === "GET" || !init?.method) {
      return new Response(JSON.stringify([profile]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const isLink = ["/invite", "/reissue", "/reset-password"].some((suffix) => String(input).endsWith(suffix));
    return new Response(JSON.stringify(isLink ? action : profile), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  assert.deepEqual(await listUsers(usersFetch), [profile]);
  const invitation = await inviteUser({ displayName: "New User", loginId: "new@example.com", access: "User" }, usersFetch);
  assert.equal(invitation.actionToken, action.actionToken);
  const inviteCall = calls.find((call) => call.url === "/api/v1/users/invite");
  assert.deepEqual(JSON.parse(String(inviteCall?.init?.body)), { displayName: "New User", loginId: "new@example.com", access: "User" });
  await reissueUserInvite("user-1", usersFetch);
  await cancelUserInvite("user-1", usersFetch);
  await resetUserPassword("user-1", usersFetch);
  await lockUser("user-1", usersFetch);
  await unlockUser("user-1", usersFetch);
  await enableUser("user-1", usersFetch);
  await disableUser("user-1", usersFetch);

  const endpoints = calls.map((call) => call.url);
  for (const endpoint of [
    "/api/v1/users", "/api/v1/users/user-1/reissue", "/api/v1/users/user-1/cancel",
    "/api/v1/users/user-1/reset-password", "/api/v1/users/user-1/lock",
    "/api/v1/users/user-1/unlock", "/api/v1/users/user-1/enable", "/api/v1/users/user-1/disable"
  ]) assert.ok(endpoints.includes(endpoint), `calls ${endpoint}`);

  const malformed: typeof fetch = async () => new Response(JSON.stringify({ ...profile, access: "Owner" }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
  await assert.rejects(() => getAuthenticatedSession(malformed), /Invalid authentication response/);
}

void main().then(() => console.log("user auth lifecycle tests passed")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
