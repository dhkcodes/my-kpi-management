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
const content = read("src/components/content/index.tsx");
const routes = read("src/components/navigationRoutes.ts");
const passwordPolicy = read("src/auth/passwordPolicy.ts");

assert.doesNotMatch(login, /kap-login__modes/, "default sign-in no longer exposes permanent credential mode tabs");
assert.match(login, /Forgot password/, "sign-in offers an explicit reset entry link");
assert.match(login, /pathname === "\/activate"[\s\S]*pathname === "\/reset-password"[\s\S]*searchParams\.get\("token"\)/, "credential pages require an action token URL");
assert.match(login, /inspectCredentialAction[\s\S]*completeCredentialAction/, "links are validated before one-time completion");
assert.doesNotMatch(login, /temporaryPassword/, "activation and reset never request a temporary password");
assert.match(login, /oj-input-password/, "credential values use masked JET inputs");
assert.match(passwordPolicy, /at least 8 characters/, "activation, reset, and profile changes enforce the server minimum before submission");
assert.match(login, /validatePasswordPolicy\(newPassword\)/, "activation and reset share the client password policy");
assert.match(login, /mode === "success"[\s\S]*Password set successfully[\s\S]*Sign in/, "activation/reset completion offers sign-in only after success");
assert.doesNotMatch(login, /onAuthenticated\(await completeCredentialAction/, "credential completion does not silently sign the user in");
assert.match(login, /invalid, expired, or already used[\s\S]*Request a new link/, "invalid action states are explicit and route to link replacement");
assert.match(login, /"\/request-reset"/, "request-new-link uses the reset request route");

for (const label of ["Display name", "Login ID", "Access", "Status"]) assert.match(profile, new RegExp(label));
for (const forbidden of ["userKey", "Sessions", "Dataset", "Tailnet", "Audit", "Token"]) {
  assert.doesNotMatch(profile, new RegExp(forbidden, "i"), `Profile does not render ${forbidden}`);
}
assert.equal((profile.match(/<dt>/g) ?? []).length, 4, "Profile renders exactly four fields");
assert.match(profile, /Change password/);
assert.match(profile, /import "ojs\/ojdialog"[\s\S]*<oj-dialog[\s\S]*initialVisibility="hide"/, "Profile mounts one Redwood JET Change password dialog");
assert.match(profile, /const openDialog[\s\S]*dialogRef\.current\?\.open\(\)[\s\S]*<oj-button[\s\S]*onojAction=\{openDialog\}[\s\S]*Change password/, "Profile exposes a Change password button that opens the dialog");
assert.match(profile, /Current password[\s\S]*New password[\s\S]*Confirm new password/, "dialog collects current, new and confirmation values");
assert.match(profile, /validatePasswordPolicy\(newPassword\)[\s\S]*New passwords do not match/, "dialog validates policy and mismatch before API submission");
assert.match(profile, /dialogRef\.current\?\.close\(\)/, "successful password change closes the dialog");

assert.match(users, /Display name[\s\S]*Login ID[\s\S]*Access[\s\S]*Status[\s\S]*Actions/, "user list has exactly the required columns");
assert.equal((users.match(/<th>/g) ?? []).length, 5, "user table has exactly five columns");
for (const value of ["Admin", "User", "INVITED", "ACTIVE", "LOCKED", "DISABLED"]) assert.match(users, new RegExp(value));
for (const action of ["Invite user", "Reissue", "Cancel invite", "Reset password", "Lock", "Unlock", "Enable", "Disable"]) assert.match(users, new RegExp(action));
assert.match(users, /disabled=\{busy \|\| user\.access === "Admin"\}[\s\S]*Lock/, "Admin Lock remains visible but disabled");
assert.match(users, /disabled=\{busy \|\| user\.access === "Admin"\}[\s\S]*Disable/, "Admin Disable remains visible but disabled");
assert.doesNotMatch(users, /user\.status === "DISABLED"[\s\S]{0,300}>Disable</, "Disabled rows do not render contradictory Disable actions");
assert.match(users, /if \(busy\) return;/, "row actions ignore repeated clicks while busy");
assert.match(users, /disabled=\{busy\}/, "user action controls are disabled while busy");
assert.match(users, /cancelBehavior=\{busy \? "none" : "icon"\}/, "dialog close affordance is disabled while link creation is in flight");
assert.match(users, /<oj-button disabled=\{busy\}[\s\S]{0,120}>Cancel<\/oj-button>/, "dialog Cancel is disabled while link creation is in flight");
assert.doesNotMatch(users, /temporaryPassword|oj-input-password/, "Admin link issuance never collects temporary passwords");
assert.doesNotMatch(users, /localStorage|sessionStorage/, "action links are never persisted in browser storage");
assert.match(users, /dialogError[\s\S]*role="alert"/, "Invite failures remain visible inside the open dialog");
assert.match(users, /No email was sent[\s\S]*approved secure channel/, "the UI does not falsely claim that invitation delivery is automated");
assert.match(users, /navigator\.clipboard\.writeText[\s\S]*Expires/, "Admin can copy the link and see its expiry");
assert.match(users, /works once|used only once/, "one-time use is explicit");
assert.match(users, /onojAction=\{\(\) => void submitDialog\(\)\}/, "JET Submit explicitly invokes the user action");
assert.match(users, /window\.confirm|confirmAction/, "destructive state changes require confirmation");
assert.match(content, /<UsersPage currentUserKey=\{profile\.userKey\}/, "Users receives the signed-in identity for self-delete protection");
assert.match(users, /import "ojs\/ojdialog"[\s\S]*deleteDialogRef[\s\S]*initialVisibility="hide"[\s\S]*Permanently delete user/, "permanent deletion uses a mounted Redwood JET confirmation dialog");
assert.match(users, /user\.userKey === currentUserKey[\s\S]*You cannot permanently delete your own signed-in account/, "the current user's permanent Delete action is disabled with an explanation");
assert.match(users, /await deleteUser\(deleteCandidate\.userKey\)[\s\S]*await reload\(\)/, "confirmed permanent deletion calls the API and refreshes users");
assert.match(users, /This action cannot be undone[\s\S]*Permanently delete/, "the permanent-delete dialog states impact before confirmation");
assert.match(read("src/styles/app.css"), /\.kap-destructive-warning\s*\{[\s\S]*background:[\s\S]*border-left:[\s\S]*color:/, "permanent-delete warning has explicit high contrast");
assert.match(users, /class="kap-users-table-wrap"[\s\S]*class="kap-users-table"/, "Users uses the Redwood admin table contract");
assert.match(users, /data-label="Display name"[\s\S]*data-label="Actions"/, "responsive user rows expose card field labels");
assert.match(users, /<oj-button[\s\S]*Reissue[\s\S]*Cancel invite[\s\S]*Reset password[\s\S]*Lock[\s\S]*Disable/, "row actions use official JET buttons");
assert.match(users, /user\.access === "Admin"[\s\S]*Admin accounts cannot be locked/, "Admin Lock and Disable explain why they are disabled");
assert.match(read("src/styles/app.css"), /@media \(max-width: 720px\)[\s\S]*\.kap-users-table thead[\s\S]*\.kap-users-table td::before/, "Users table becomes labeled cards on narrow screens");

assert.match(header, /value="profile"[\s\S]*Profile/, "profile menu links to Profile");
assert.match(header, /access === "Admin"[\s\S]*value="users"/, "Users menu is Admin-only");
assert.match(app, /subscribeAuthRequired/, "the app returns to login for centralized 401 notifications");
assert.match(routes, /id: "profile"[\s\S]*id: "users"/, "profile and users routes retain normal route compatibility");

console.log("user UI contract tests passed");
