import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const app = read("src/components/app.tsx");
const login = read("src/components/LoginPage.tsx");
const header = read("src/components/header.tsx");

assert.match(app, /getAuthenticatedSession/, "startup verifies the HttpOnly server session");
assert.match(app, /authChecking/, "the data-loading App shell is not mounted before server session verification");
assert.doesNotMatch(app, /sessionStorage|readAuthSession|writeAuthSession/, "client storage cannot establish authentication");
assert.match(app, /logoutUser[\s\S]*setSession\(null\)/, "logout invalidates the server session and unmounts draft state");
assert.match(app, /addEventListener\("popstate", keepLoginAtHomePath\)/, "Back remains guarded after logout");
assert.match(login, /id="kapLoginUserId"[\s\S]*id="kapLoginPassword"[\s\S]*id="kapLoginSubmit"/, "the Redwood sign-in form exposes stable controls");
assert.match(login, /role="alert"/, "credential failures are announced");
assert.match(login, /authenticateUser\(userId, password\)/, "the sign-in form delegates credentials to the Backend auth API");
assert.match(login, /isSubmitting[\s\S]*disabled=\{isSubmitting\}/, "duplicate login submissions are locked while authentication is pending");
assert.doesNotMatch(login, /KAP_AUTH_CONFIG|authenticateConfiguredUser/, "the UI does not read a browser-visible credential config");
assert.match(header, /selectedValue === "logout"[\s\S]*onLogout\(\)/, "the profile menu invokes logout");
assert.match(header, /\{userLogin\}/, "the Header profile is based on the authenticated login ID");

console.log("authUiContract tests passed");
