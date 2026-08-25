import assert from "node:assert/strict";
import {
  AUTH_SESSION_STORAGE_KEY,
  AuthSession,
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

const storage = new MemoryStorage();
const session: AuthSession = {
  version: 1,
  userId: "test-user@example.invalid",
  authenticatedAt: new Date().toISOString()
};

writeAuthSession(storage, session);
assert.deepEqual(readAuthSession(storage), session, "the same-tab session round-trips through storage");
assert.ok(storage.getItem(AUTH_SESSION_STORAGE_KEY));
assert.equal(getProfileInitials(session.userId), "T");

clearAuthSession(storage);
assert.equal(readAuthSession(storage), null, "logout removes the local session");

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ version: 1, userId: "someone.else@example.invalid" }));
assert.equal(readAuthSession(storage), null, "an incomplete profile is not accepted");

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  version: 1,
  userId: "test-user@example.invalid",
  authenticatedAt: ""
}));
assert.equal(readAuthSession(storage), null, "an invalid timestamp is rejected");

console.log("authSession tests passed");
