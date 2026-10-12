import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const styles = readFileSync(resolve(root, "src/styles/app.css"), "utf8");
const analysis = readFileSync(resolve(root, "src/components/content/ConsumptionAnalysisPage.tsx"), "utf8");
const forecast = readFileSync(resolve(root, "src/components/content/ForecastActualPage.tsx"), "utf8");
const records = readFileSync(resolve(root, "src/components/content/ConsumptionRecordsPage.tsx"), "utf8");
const mtdControl = readFileSync(resolve(root, "src/components/content/ConsumptionMtdControl.tsx"), "utf8");

assert.match(styles,
  /\.kap-page-shell\.consumption-insights-page \.consumption-page-progress-controls\s*\{[^}]*inset:\s*0;[^}]*position:\s*fixed;[^}]*z-index:\s*48;/s,
  "Analysis/FVA loading progress must remain a viewport overlay above sticky table headers");
assert.match(styles,
  /\.kap-page-shell\.consumption-insights-page \.consumption-page-progress-controls\[data-visible="true"\]\s*\{[^}]*display:\s*block;/s,
  "visible Analysis/FVA progress host must not become table-grid content");
assert.doesNotMatch(styles,
  /(?:^|\n)\.consumption-info-tooltip\s*\{[^}]*margin-top:/s,
  "shared tooltip styling must not push every explanation icon below its label");
assert.match(styles,
  /\.consumption-insights-page \.consumption-info-tooltip\s*\{[^}]*vertical-align:\s*super;/s,
  "Analysis explanation icons must be restored beside the label as superscripts");

assert.match(records, /const recordsQueryControlsDisabled = recordsActivityBusy/,
  "Records filters and toolbar controls must share the actual page query lock");
for (const control of ["Consumption Records pillar", "consumptionFromQuarter", "consumptionToQuarter", "consumptionRecordSearch", "Apply filters and search"]) {
  assert.match(records, new RegExp(`${control}[\\s\\S]{0,500}disabled=\\{[^}]*recordsQueryControlsDisabled`),
    `${control} must lock while a Records request is active`);
}
assert.match(records,
  /<ConsumptionMtdControl checked=\{showMtd\} disabled=\{[^}]*recordsQueryControlsDisabled/,
  "Records Include MTD must lock during every Records request");
assert.match(records,
  /refreshDisabled=\{recordsActivityBusy \|\| hasDraftChanges\}/,
  "Records Reload must use the same query lock");
assert.doesNotMatch(records,
  /const runRecordsQuery[\s\S]*?setRecords\(\[\]\)[\s\S]*?await loadRecordsPage/,
  "Records refresh must retain the last successful rows while the replacement request is pending");
assert.doesNotMatch(records,
  /const runRecordsQuery[\s\S]*?catch[\s\S]*?setRecords\(\[\]\)/,
  "Records refresh failure must retain the last successful rows");
assert.match(records, /\|\| recordsLoadingRef\.current \|\| consumptionSummaryLoading/,
  "Records event handlers must reject re-entry even before disabled rendering settles");
assert.match(records, /const summaryLoadingRef = useRef\(false\)/,
  "Records Include MTD must have a synchronous request guard");
assert.match(records,
  /if \(recordsLoadingRef\.current \|\| summaryLoadingRef\.current\) return;[\s\S]{0,400}loadConsumptionSummary[\s\S]{0,200}if \(applied\) setShowMtd\(next\)/,
  "Records Include MTD must keep the last successful mode until the replacement summary succeeds");

for (const [name, source] of [["Analysis", analysis], ["FVA", forecast]] as const) {
  assert.match(source, /const queryControlsLocked = loading;/,
    `${name} must expose one loading lock for all query controls`);
  assert.match(source, /if \(queryControlsLockRef\.current\) return;/,
    `${name} query handlers must reject re-entry before disabled rendering settles`);
}
assert.match(analysis, /setComboboxOpen\(false\)/,
  "Analysis must close an already-open Account list when loading starts");

assert.match(mtdControl, />Include MTD</,
  "the shared three-page MTD switch label must say Include MTD");
assert.match(mtdControl, /aria-label="About Include MTD"/,
  "the MTD accessibility name must match Include MTD");
assert.doesNotMatch(mtdControl, /Show MTD/,
  "the old ambiguous label must not remain in the shared MTD control");

console.log("consumption loading-regression contract passed");
