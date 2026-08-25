import assert from "node:assert/strict";
import { AuthSession, getProfileInitials } from "../src/auth/authSession";

const session: AuthSession = {
  version: 1,
  userId: "owner@example.com",
  authenticatedAt: "2026-08-25T00:00:00.000Z"
};
assert.equal(session.userId, "owner@example.com");
assert.equal(getProfileInitials("owner@example.com"), "OW");
assert.equal(getProfileInitials("kpi owner"), "KO");
assert.equal(getProfileInitials("x"), "X");

console.log("auth session tests passed");
