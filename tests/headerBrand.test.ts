import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearKapHeaderLoginSession,
  getOrCreateKapHeaderLogo,
  KAP_HEADER_VARIANT_STORAGE_KEY,
  selectKapHeaderLogo,
  startNewKapHeaderLoginSession
} from "../src/components/kapHeaderBrand";

const root = process.cwd();
const header = readFileSync(join(root, "src/components/header.tsx"), "utf8");
const brand = readFileSync(join(root, "src/components/kapHeaderBrand.ts"), "utf8");
const app = readFileSync(join(root, "src/components/app.tsx"), "utf8");
const css = readFileSync(join(root, "src/styles/app.css"), "utf8");

const pngDimensions = (path: string) => {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", `${path} is a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const relative = "styles/images/kap-header-terracotta-redwood-v1.png";
const iconRelative = "styles/images/kap-header-terracotta-redwood-v1-icon.png";
assert.match(brand, /KAP_TERRACOTTA_LOGO[\s\S]*variant: "terracotta"/, "the KAP header is locked to terracotta branding");
assert.equal(existsSync(join(root, "src", relative)), true, "terracotta KAP image exists");
assert.deepEqual(pngDimensions(join(root, "src", relative)), { width: 1600, height: 300 }, "terracotta uses the full logo artwork");
assert.equal(
  createHash("sha256").update(readFileSync(join(root, "src", relative))).digest("hex"),
  "257ba9b2c421f66fcdc68909183a500db642b4c7c16dcf962f71a1fe517153c7",
  "desktop and login branding uses the approved Presentation Lead artwork byte-for-byte"
);
assert.equal(existsSync(join(root, "src", iconRelative)), true, "terracotta mobile icon exists");
assert.deepEqual(pngDimensions(join(root, "src", iconRelative)), { width: 315, height: 300 }, "terracotta icon is cropped from the artwork");

class SharedStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new SharedStorage();
assert.equal(startNewKapHeaderLoginSession(storage).variant, "terracotta", "new login selects terracotta");
assert.equal(getOrCreateKapHeaderLogo(storage).variant, "terracotta", "refresh and token refresh retain terracotta");
const sameSessionTab = storage;
assert.equal(getOrCreateKapHeaderLogo(sameSessionTab).variant, "terracotta", "tabs sharing the auth session use terracotta");
clearKapHeaderLoginSession(storage);
assert.equal(storage.getItem(KAP_HEADER_VARIANT_STORAGE_KEY), null, "logout or expiry clears the brand state");
assert.equal(startNewKapHeaderLoginSession(storage).variant, "terracotta", "re-login remains on the fixed brand");
assert.equal(selectKapHeaderLogo().variant, "terracotta", "selection is deterministic");
assert.equal([...storage.values.values()].every((value) => value === "terracotta"), true, "storage contains only the public fixed variant name");
assert.doesNotMatch(KAP_HEADER_VARIANT_STORAGE_KEY, /token|cookie|secret|user|login/i, "storage key exposes no auth identity or secret");

assert.match(header, /useState\(getOrCreateKapHeaderLogo\)/, "header restores the login-session selection");
assert.match(header, /window\.addEventListener\("storage", syncBrandAcrossTabs\)/, "open tabs converge on the shared session selection");
assert.match(header, /<source media="\(max-width: 720px\)" srcSet=\{selectedKapHeaderLogo\.iconSrc\}/, "mobile renders the selected variant's icon crop");
assert.match(header, /src=\{selectedKapHeaderLogo\.src\} alt="Know the pulse, Act on it\. Perform\."/, "desktop renders the full logo with the complete accessible name");
assert.doesNotMatch(brand, /Math\.random|gold|purple|blue|coral/, "legacy random variants cannot re-enter the brand path");
assert.match(header, /data-variant=\{selectedKapHeaderLogo\.variant\}/, "rendered variant is observable for runtime verification");
assert.match(header, /class="kpi-header__oracle-logo" src="styles\/images\/oracle_logo\.svg"/, "existing Oracle logo asset is rendered independently");
assert.match(header, /<div class="kpi-header__brand"[\s\S]*<\/picture>\s*<img class="kpi-header__oracle-logo"[\s\S]*<\/div>/, "Oracle sits beside KAP inside the brand lockup");
assert.match(app, /if \(!verifiedSession\) clearKapHeaderLoginSession\(\)/, "expired restored sessions clear the brand selection");
assert.match(app, /const handleAuthenticated[\s\S]*startNewKapHeaderLoginSession\(\)[\s\S]*setSession\(authenticatedSession\)/, "successful login selects before mounting the authenticated header");
assert.match(app, /logoutUser\(\)[\s\S]*clearKapHeaderLoginSession\(\)[\s\S]*setSession\(null\)/, "successful logout clears the brand selection");
assert.match(css, /\.kap-header-wordmark\s*\{[^}]*object-fit:\s*contain;/s, "KAP artwork keeps its original ratio");
assert.match(css, /\.kap-header-wordmark\s*\{[^}]*height:\s*2\.15rem;[^}]*width:\s*auto;/s, "desktop KAP height is compact without distorting its ratio");
assert.match(css, /\.kpi-header__oracle-logo\s*\{[^}]*margin:\s*0 0 \.12rem -2\.35rem;/s, "desktop Oracle compensates for the full KAP artwork's trailing white space");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.kpi-header__oracle-logo\s*\{[^}]*margin:\s*0 0 \.1rem \.05rem;/s, "mobile keeps a non-overlapping positive Oracle margin beside the cropped KAP icon");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.kpi-header__oracle-logo/, "mobile header has dedicated Oracle logo sizing");

console.log("header brand tests passed");
