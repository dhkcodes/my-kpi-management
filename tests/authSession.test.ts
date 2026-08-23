import assert from "node:assert/strict";
import {
  AUTH_SESSION_STORAGE_KEY,
  authenticateConfiguredUser,
  clearAuthSession,
  getProfileInitials,
  readAuthSession,
  writeAuthSession
} from "../src/auth/authSession";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const testCredentials = {
  userId: "test-user@example.invalid",
  password: "test-password"
};
globalThis.KAP_AUTH_CONFIG = testCredentials;

const storage = new MemoryStorage();
assert.equal(authenticateConfiguredUser(testCredentials.userId, "wrong"), null, "wrong credentials are rejected");

const session = authenticateConfiguredUser(testCredentials.userId, testCredentials.password);
assert.ok(session, "configured credentials create a session");
assert.equal(session.userId, testCredentials.userId);

writeAuthSession(storage, session);
assert.deepEqual(readAuthSession(storage), session, "the same-tab session round-trips through storage");
assert.ok(storage.getItem(AUTH_SESSION_STORAGE_KEY));
assert.equal(getProfileInitials(session.userId), "T");

clearAuthSession(storage);
assert.equal(readAuthSession(storage), null, "logout removes the local session");

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ version: 1, userId: "someone.else@example.invalid" }));
assert.equal(readAuthSession(storage), null, "a tampered profile is not accepted");

globalThis.KAP_AUTH_CONFIG = undefined;
assert.equal(authenticateConfiguredUser(testCredentials.userId, testCredentials.password), null, "missing runtime config fails closed");

console.log("authSession tests passed");
