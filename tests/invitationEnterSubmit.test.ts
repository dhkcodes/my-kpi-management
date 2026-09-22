import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const login = readFileSync("src/components/LoginPage.tsx", "utf8");
assert.match(login, /<form[^>]*ref=\{formRef\}[^>]*onSubmit=\{submit\}/s);
assert.match(login, /<button[^>]*type="submit"[^>]*class="kap-login-native-submit"/s);
assert.match(login, /formRef\.current\?\.requestSubmit\(\)/);
assert.match(login, /submitLockRef\.current/);
assert.doesNotMatch(login, /onojAction=\{\(event: Event\) => void submit\(event\)\}/);
console.log("invitation Enter-submit tests passed");
