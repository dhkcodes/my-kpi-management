import assert from "node:assert/strict";
import { authenticateUser } from "../src/auth/authApi";

async function main() {
  let capturedUrl = "";
  let capturedBody = "";
  const successFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ userId: "user@example.invalid" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const session = await authenticateUser("  USER@EXAMPLE.INVALID  ", "test-password", successFetch);
  assert.equal(capturedUrl, "/api/v1/auth/login");
  assert.deepEqual(JSON.parse(capturedBody), {
    userId: "user@example.invalid",
    password: "test-password"
  });
  assert.equal(session.userId, "user@example.invalid");
  assert.equal(Object.prototype.hasOwnProperty.call(session, "password"), false);

  const invalidFetch: typeof fetch = async () => new Response(JSON.stringify({
    code: "INVALID_CREDENTIALS",
    message: "The user ID or password is incorrect."
  }), { status: 401, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    () => authenticateUser("user", "wrong", invalidFetch),
    (error: unknown) => error instanceof Error && error.message === "The user ID or password is incorrect."
  );

  const malformedFetch: typeof fetch = async () => new Response(JSON.stringify({ passwordHash: "unexpected" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  await assert.rejects(() => authenticateUser("user", "password", malformedFetch), /invalid response/i);

  console.log("authApi tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
