import assert from "node:assert/strict";
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

for (const variant of ["gold", "purple", "blue", "coral"]) {
  const relative = `styles/images/kap-header-${variant}.png`;
  const iconRelative = `styles/images/kap-header-${variant}-icon.png`;
  assert.match(brand, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${variant} KAP header variant is selectable`);
  assert.equal(existsSync(join(root, "src", relative)), true, `${variant} KAP image exists`);
  assert.deepEqual(pngDimensions(join(root, "src", relative)), { width: 1600, height: 300 }, `${variant} uses the new full logo artwork`);
  assert.match(brand, new RegExp(iconRelative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${variant} mobile icon follows the selected variant`);
  assert.equal(existsSync(join(root, "src", iconRelative)), true, `${variant} mobile icon exists`);
  assert.deepEqual(pngDimensions(join(root, "src", iconRelative)), { width: 315, height: 300 }, `${variant} icon is cropped from the new artwork`);
}

class SharedStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new SharedStorage();
assert.equal(startNewKapHeaderLoginSession(storage, 0.3).variant, "purple", "new login selects a variant");
assert.equal(getOrCreateKapHeaderLogo(storage, 0.99).variant, "purple", "refresh and token refresh retain the login-session variant");
const sameSessionTab = storage;
assert.equal(getOrCreateKapHeaderLogo(sameSessionTab, 0.55).variant, "purple", "tabs sharing the auth session use the same variant");
clearKapHeaderLoginSession(storage);
assert.equal(storage.getItem(KAP_HEADER_VARIANT_STORAGE_KEY), null, "logout or expiry clears the brand state");
assert.equal(startNewKapHeaderLoginSession(storage, 0.55).variant, "blue", "re-login performs a fresh selection");
assert.equal(selectKapHeaderLogo(0.99).variant, "coral", "all random buckets remain reachable");
assert.equal([...storage.values.values()].every((value) => ["gold", "purple", "blue", "coral"].includes(value)), true, "storage contains only a public variant name");
assert.doesNotMatch(KAP_HEADER_VARIANT_STORAGE_KEY, /token|cookie|secret|user|login/i, "storage key exposes no auth identity or secret");

assert.match(header, /useState\(getOrCreateKapHeaderLogo\)/, "header restores the login-session selection");
assert.match(header, /window\.addEventListener\("storage", syncBrandAcrossTabs\)/, "open tabs converge on the shared session selection");
assert.match(header, /<source media="\(max-width: 720px\)" srcSet=\{selectedKapHeaderLogo\.iconSrc\}/, "mobile renders the selected variant's icon crop");
assert.match(header, /src=\{selectedKapHeaderLogo\.src\} alt="KAP"/, "desktop renders the selected full logo with the KAP accessible name");
assert.doesNotMatch(header, /KAP_HEADER_LOGOS\.map\(/, "all four KAP variants are not rendered together");
assert.match(header, /data-variant=\{selectedKapHeaderLogo\.variant\}/, "rendered variant is observable for runtime verification");
assert.match(header, /class="kpi-header__oracle-logo" src="styles\/images\/oracle_logo\.svg"/, "existing Oracle logo asset is rendered independently");
assert.match(header, /<div class="kpi-header__brand"[\s\S]*<\/picture>\s*<img class="kpi-header__oracle-logo"[\s\S]*<\/div>/, "Oracle sits beside KAP inside the brand lockup");
assert.match(app, /if \(!verifiedSession\) clearKapHeaderLoginSession\(\)/, "expired restored sessions clear the brand selection");
assert.match(app, /const handleAuthenticated[\s\S]*startNewKapHeaderLoginSession\(\)[\s\S]*setSession\(authenticatedSession\)/, "successful login selects before mounting the authenticated header");
assert.match(app, /logoutUser\(\)[\s\S]*clearKapHeaderLoginSession\(\)[\s\S]*setSession\(null\)/, "successful logout clears the brand selection");
assert.match(css, /\.kap-header-wordmark\s*\{[^}]*object-fit:\s*contain;/s, "KAP artwork keeps its original ratio");
assert.match(css, /\.kap-header-wordmark\s*\{[^}]*height:\s*2\.15rem;[^}]*width:\s*auto;/s, "desktop KAP height is compact without distorting its ratio");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.kpi-header__oracle-logo/, "mobile header has dedicated Oracle logo sizing");

console.log("header brand tests passed");
