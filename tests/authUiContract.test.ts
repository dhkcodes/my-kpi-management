import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const app = read("src/components/app.tsx");
const login = read("src/components/LoginPage.tsx");
const header = read("src/components/header.tsx");

assert.match(app, /readAuthSession\(window\.sessionStorage\)/, "same-tab refresh restores the local session");
assert.match(app, /session\s*\?\s*<AuthenticatedApp[\s\S]*:\s*<LoginPage/, "the data-loading App shell is not mounted before login");
assert.match(app, /writeAuthSession[\s\S]*history\.replaceState\(null, "", "\/"\)[\s\S]*setSession/, "successful login replaces the URL and opens Home");
assert.match(app, /clearAuthSession[\s\S]*history\.replaceState\(null, "", "\/"\)[\s\S]*setSession\(null\)/, "logout clears the session, replaces history, and unmounts draft state");
assert.match(app, /addEventListener\("popstate", keepLoginAtHomePath\)/, "Back remains guarded after logout");
assert.match(login, /id="kapLoginUserId"[\s\S]*id="kapLoginPassword"[\s\S]*id="kapLoginSubmit"/, "the Redwood sign-in form exposes stable controls");
assert.match(login, /role="alert"/, "credential failures are announced");
assert.doesNotMatch(login, /fetch\(|\/api\//, "the UX gate never calls a Backend authentication API");
assert.match(header, /selectedValue === "logout"[\s\S]*onLogout\(\)/, "the profile menu invokes logout");
assert.match(header, /\{userLogin\}/, "the Header profile is based on the authenticated login ID");

console.log("authUiContract tests passed");
