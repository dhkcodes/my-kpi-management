import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const header = readFileSync(join(root, "src/components/header.tsx"), "utf8");
const css = readFileSync(join(root, "src/styles/app.css"), "utf8");

for (const variant of ["gold", "purple", "blue", "coral"]) {
  const relative = `styles/images/kap-header-${variant}.png`;
  const iconRelative = `styles/images/kap-header-${variant}-icon.png`;
  assert.match(header, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${variant} KAP header variant is selectable`);
  assert.equal(existsSync(join(root, "src", relative)), true, `${variant} KAP image exists`);
  assert.match(header, new RegExp(iconRelative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${variant} mobile icon follows the selected variant`);
  assert.equal(existsSync(join(root, "src", iconRelative)), true, `${variant} mobile icon exists`);
}

assert.match(header, /const selectedKapHeaderLogo = selectKapHeaderLogo\(\)/, "one logo is selected once at module load");
assert.match(header, /<source media="\(max-width: 720px\)" srcSet=\{selectedKapHeaderLogo\.iconSrc\}/, "mobile renders the selected variant's icon crop");
assert.match(header, /src=\{selectedKapHeaderLogo\.src\} alt="KAP"/, "desktop renders the selected full logo with the KAP accessible name");
assert.doesNotMatch(header, /KAP_HEADER_LOGOS\.map\(/, "all four KAP variants are not rendered together");
assert.match(header, /data-variant=\{selectedKapHeaderLogo\.variant\}/, "rendered variant is observable for runtime verification");
assert.match(header, /class="kpi-header__oracle-logo" src="styles\/images\/oracle_logo\.svg"/, "existing Oracle logo asset is rendered independently");
assert.match(css, /\.kap-header-wordmark\s*\{[^}]*object-fit:\s*contain;/s, "KAP artwork keeps its original ratio");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.kpi-header__oracle-logo/, "mobile header has dedicated Oracle logo sizing");

console.log("header brand tests passed");
