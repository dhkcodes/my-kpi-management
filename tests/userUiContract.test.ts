import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const login = read("src/components/LoginPage.tsx");
const app = read("src/components/app.tsx");
const header = read("src/components/header.tsx");
const profile = read("src/components/content/ProfilePage.tsx");
const users = read("src/components/content/UsersPage.tsx");
const routes = read("src/components/navigationRoutes.ts");

assert.doesNotMatch(login, /kap-login__modes/, "default sign-in no longer exposes permanent credential mode tabs");
assert.match(login, /Forgot or reset credential/, "sign-in offers an explicit reset entry link");
assert.match(login, /pathname === "\/activate"[\s\S]*loginId/, "Activate is exposed only from a structurally valid activation link");
assert.match(login, /temporaryPassword[\s\S]*newPassword/, "activation and reset collect one-time and replacement credentials");
assert.match(login, /oj-input-password/, "credential values use masked JET inputs");
assert.doesNotMatch(login, /token/i, "activation and reset do not ask for raw tokens");

for (const label of ["Display name", "Login ID", "Access", "Status"]) assert.match(profile, new RegExp(label));
for (const forbidden of ["userKey", "Sessions", "Dataset", "Tailnet", "Audit", "Token"]) {
  assert.doesNotMatch(profile, new RegExp(forbidden, "i"), `Profile does not render ${forbidden}`);
}
assert.equal((profile.match(/<dt>/g) ?? []).length, 4, "Profile renders exactly four fields");
assert.match(profile, /Change password/);

assert.match(users, /Display name[\s\S]*Login ID[\s\S]*Access[\s\S]*Status[\s\S]*Actions/, "user list has exactly the required columns");
assert.equal((users.match(/<th>/g) ?? []).length, 5, "user table has exactly five columns");
for (const value of ["Admin", "User", "INVITED", "ACTIVE", "LOCKED", "DISABLED"]) assert.match(users, new RegExp(value));
for (const action of ["Invite user", "Reissue", "Cancel invite", "Reset password", "Lock", "Unlock", "Enable", "Disable"]) assert.match(users, new RegExp(action));
assert.match(users, /user\.access !== "Admin" && user\.status === "ACTIVE"[\s\S]*Lock/, "Admin rows do not render Lock");
assert.match(users, /user\.access !== "Admin" && <button[\s\S]*Disable/, "Admin rows do not render Disable");
assert.match(users, /type="password"|oj-input-password/, "temporary passwords are masked");
assert.doesNotMatch(users, /localStorage|sessionStorage/, "temporary passwords are never persisted");
assert.match(users, /dialogError[\s\S]*role="alert"/, "Invite failures remain visible inside the open dialog");
assert.match(users, /must be delivered securely by the administrator/, "the UI does not falsely claim that invitation delivery is automated");
assert.match(users, /onojAction=\{\(\) => void submitDialog\(\)\}/, "JET Submit explicitly invokes the user action");
assert.match(users, /window\.confirm|confirmAction/, "destructive state changes require confirmation");

assert.match(header, /value="profile"[\s\S]*Profile/, "profile menu links to Profile");
assert.match(header, /access === "Admin"[\s\S]*value="users"/, "Users menu is Admin-only");
assert.match(app, /subscribeAuthRequired/, "the app returns to login for centralized 401 notifications");
assert.match(routes, /id: "profile"[\s\S]*id: "users"/, "profile and users routes retain normal route compatibility");

console.log("user UI contract tests passed");
