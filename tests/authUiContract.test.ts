import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const app = read("src/components/app.tsx");
const login = read("src/components/LoginPage.tsx");
const header = read("src/components/header.tsx");
const styles = read("src/styles/app.css");

assert.match(app, /getAuthenticatedSession/, "startup verifies the HttpOnly server session");
assert.match(app, /authChecking/, "the data-loading App shell is not mounted before server session verification");
assert.doesNotMatch(app, /sessionStorage|readAuthSession|writeAuthSession/, "client storage cannot establish authentication");
assert.match(app, /logoutUser[\s\S]*\.then\([\s\S]*setSession\(null\)/, "logout clears client state only after server invalidation succeeds");
assert.doesNotMatch(app, /logoutUser\(\)\.finally/, "failed logout cannot appear successful while the server cookie remains valid");
assert.match(app, /addEventListener\("popstate", keepLoginAtHomePath\)/, "Back remains guarded after logout");
assert.match(login, /id="kapLoginUserId"[\s\S]*id="kapLoginPassword"[\s\S]*id="kapLoginSubmit"/, "the Redwood sign-in form exposes stable controls");
assert.match(login, /role="alert"/, "credential failures are announced");
assert.match(login, /authenticateUser\(submittedLoginId, submittedPassword\)/, "the sign-in form delegates live credentials to the Backend auth API");
assert.match(login, /const readCurrentJetValue[\s\S]*\.rawValue[\s\S]*\.value/,
  "submit reads Oracle JET rawValue before committed value because Enter submits before valueChanged");
assert.match(login, /input\?\.rawValue \?\? input\?\.value \?\? fallback/,
  "an explicitly cleared JET rawValue remains empty instead of restoring stale committed or React state");
assert.doesNotMatch(login, /input\?\.rawValue\s*\|\|/,
  "JET rawValue never uses truthy fallback because empty text is meaningful");
assert.match(login, /mode === "signIn"[\s\S]*readCurrentJetValue\(usernameInputRef\.current, loginId\)[\s\S]*readCurrentJetValue\(passwordInputRef\.current, password\)[\s\S]*authenticateUser\(submittedLoginId, submittedPassword\)/,
  "Enter submit sends the current uncommitted JET credentials through the same login request path as the Sign in button");
assert.match(login, /isSubmitting[\s\S]*disabled=\{isSubmitting\}/, "duplicate login submissions are locked while authentication is pending");
assert.match(login, /mode === "forgot"[\s\S]*readCurrentJetValue\(usernameInputRef\.current, loginId\)[\s\S]*requestPasswordReset\(submittedLoginId\)[\s\S]*setResetLink\(reset\.resetLink \?\? ""\)/, "password-reset request submits the current JET Login ID and renders only a trusted API reset link");
assert.match(login, /mode === "action"[\s\S]*readCurrentJetValue\(newPasswordInputRef\.current, newPassword\)[\s\S]*readCurrentJetValue\(confirmPasswordInputRef\.current, confirmPassword\)[\s\S]*validatePasswordPolicy\(submittedNewPassword\)[\s\S]*completeCredentialAction\([\s\S]*submittedNewPassword,[\s\S]*submittedConfirmPassword/, "activation and reset completion validate and submit current uncommitted JET password values");
assert.match(login, /href=\{resetLink\}[\s\S]*Reset password now/, "forgot-password completion renders the actual reset link as a clickable anchor");
assert.match(login, /kap-login-warning[\s\S]*Anyone with this link/, "the sensitive-link warning is explicit and announced with improved contrast");
assert.match(login, /history\.replaceState\(null, "", window\.location\.pathname\)/, "captured action tokens are removed from the visible URL and browser history");
assert.match(login, /class="kap-login-page oj-bg-neutral-0"[\s\S]*class="kap-login-card"/, "login and reset use a Redwood Light responsive card");
assert.match(styles, /\.kap-login-page\s*\{[\s\S]*\.kap-login-card\s*\{[\s\S]*@media \(max-width: 480px\)[\s\S]*\.kap-login-card/, "Redwood Light auth card has a narrow-screen layout");
assert.match(styles, /\.kap-login-warning\s*\{[\s\S]*background:[\s\S]*border-left:[\s\S]*color:/, "auth warning has explicit high-contrast surface, edge, and text");
assert.match(styles, /\.kap-login-success p\s*\{[\s\S]*color: var\(--oj-core-text-color-primary/, "success guidance keeps primary text contrast");
assert.doesNotMatch(login, /KAP_AUTH_CONFIG|authenticateConfiguredUser/, "the UI does not read a browser-visible credential config");
assert.match(header, /value === "logout"[\s\S]*onLogout\(\)/, "the profile menu invokes logout");
assert.match(header, /profile\.loginId/, "the Header identity comes from the authenticated profile");

console.log("authUiContract tests passed");
