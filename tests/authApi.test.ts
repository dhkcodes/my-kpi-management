import assert from "node:assert/strict";
import { authenticateUser, getAuthenticatedSession, logoutUser } from "../src/auth/authApi";

async function main() {
  let capturedUrl = "";
  let capturedBody = "";
  let capturedCredentials = "";
  const successFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body ?? "");
    capturedCredentials = String(init?.credentials ?? "");
    return new Response(JSON.stringify({ userId: "owner@example.com" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const session = await authenticateUser("  OWNER@EXAMPLE.COM  ", "secret-value", successFetch);
  assert.equal(capturedUrl, "/api/v1/auth/login");
  assert.equal(capturedCredentials, "same-origin");
  assert.deepEqual(JSON.parse(capturedBody), {
    userId: "owner@example.com",
    password: "secret-value"
  });
  assert.equal(session.userId, "owner@example.com");
  assert.equal("password" in session, false);

  const invalidFetch: typeof fetch = async () => new Response(
    JSON.stringify({ code: "INVALID_CREDENTIALS" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
  await assert.rejects(
    () => authenticateUser("owner@example.com", "wrong", invalidFetch),
    /The user ID or password is incorrect\./
  );

  const malformedFetch: typeof fetch = async () => new Response(
    JSON.stringify({ userId: "" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
  await assert.rejects(
    () => authenticateUser("owner@example.com", "anything", malformedFetch),
    /invalid authentication response/i
  );

  const sessionFetch: typeof fetch = async () => new Response(
    JSON.stringify({ userId: "owner@example.com" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
  assert.equal((await getAuthenticatedSession(sessionFetch))?.userId, "owner@example.com");
  const noSessionFetch: typeof fetch = async () => new Response("", { status: 401 });
  assert.equal(await getAuthenticatedSession(noSessionFetch), null);

  let logoutCalled = false;
  const logoutFetch: typeof fetch = async (input, init) => {
    logoutCalled = String(input) === "/api/v1/auth/logout" && init?.method === "POST";
    return new Response(null, { status: 204 });
  };
  await logoutUser(logoutFetch);
  assert.equal(logoutCalled, true);
}

void main().then(() => {
  console.log("auth API tests passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
