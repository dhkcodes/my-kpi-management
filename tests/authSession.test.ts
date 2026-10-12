import assert from "node:assert/strict";
import { AuthSession, formatLastLoginAtKst, getProfileInitials, parseAuthProfile } from "../src/auth/authSession";

const session: AuthSession = {
  userKey: "user-1",
  displayName: "KPI Owner",
  loginId: "owner@example.com",
  access: "Admin",
  status: "ACTIVE",
  lastLoginAt: null,
  menuPermissions: {}
};
assert.equal(session.loginId, "owner@example.com");
assert.equal(getProfileInitials(session.displayName), "KO");
assert.equal(getProfileInitials("x"), "X");
assert.deepEqual(parseAuthProfile(session), session);
assert.equal(parseAuthProfile({ ...session, lastLoginAt: "2026-10-12T10:46:10Z" }).lastLoginAt, "2026-10-12T10:46:10Z");
assert.equal(formatLastLoginAtKst("2026-10-12T10:46:10Z"), "2026-10-12 19:46:10");
assert.equal(formatLastLoginAtKst(null), "No login record");
assert.throws(() => parseAuthProfile({ ...session, lastLoginAt: "not-a-date" }), /Invalid authentication response/);
assert.throws(() => parseAuthProfile({ ...session, status: "PENDING" }), /Invalid authentication response/);

console.log("auth session tests passed");
