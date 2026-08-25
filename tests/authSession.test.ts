import assert from "node:assert/strict";
import { AuthSession, getProfileInitials, parseAuthProfile } from "../src/auth/authSession";

const session: AuthSession = {
  userKey: "user-1",
  displayName: "KPI Owner",
  loginId: "owner@example.com",
  access: "Admin",
  status: "ACTIVE"
};
assert.equal(session.loginId, "owner@example.com");
assert.equal(getProfileInitials(session.displayName), "KO");
assert.equal(getProfileInitials("x"), "X");
assert.deepEqual(parseAuthProfile(session), session);
assert.throws(() => parseAuthProfile({ ...session, status: "PENDING" }), /Invalid authentication response/);

console.log("auth session tests passed");
