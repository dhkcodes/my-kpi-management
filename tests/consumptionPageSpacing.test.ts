import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatForecastCoverage } from "../src/data/consumptionForecastCoverage";

const root = process.cwd();
const styles = readFileSync(resolve(root, "src/styles/app.css"), "utf8");
const analysis = readFileSync(resolve(root, "src/components/content/ConsumptionAnalysisPage.tsx"), "utf8");
const forecast = readFileSync(resolve(root, "src/components/content/ForecastActualPage.tsx"), "utf8");

assert.match(analysis, /className="consumption-insights-page"/,
  "Analysis must use the shared consumption-insights shell");
assert.match(forecast, /className="consumption-insights-page forecast-actual-page"/,
  "Forecast vs Actual must use the shared consumption-insights shell");
assert.match(styles,
  /\.kap-page-shell\.consumption-insights-page \.kap-page-shell__inner\s*\{[^}]*gap:\s*\.375rem/s,
  "Analysis and Forecast vs Actual must keep the six-pixel page rhythm");
assert.match(styles,
  /\.kap-page-shell\.consumption-page \.consumption-table-panel\s*\{[^}]*margin-top:\s*\.375rem/s,
  "Records filter-to-reload spacing must use six pixels");
assert.match(styles,
  /\.kap-page-shell\.consumption-page \.consumption-table-heading\s*\{[^}]*margin-bottom:\s*0/s,
  "Records heading must not own a second gap below Reload");
assert.match(styles,
  /\.kap-page-shell\.consumption-page \.consumption-summary\s*\{[^}]*margin:\s*\.375rem 0;/s,
  "Records Summary must start exactly six CSS pixels below its heading");
assert.match(styles,
  /@media \(max-width: 760px\)[\s\S]*\.kap-page-shell\.consumption-page \.consumption-summary\s*\{[^}]*margin:\s*\.375rem 0 \.25rem;/,
  "mobile Records must preserve the same six-pixel Summary top gap");
assert.match(styles,
  /@media \(max-width: 760px\)[\s\S]*\.kap-page-shell\.consumption-page \.consumption-table-heading\s*\{[^}]*margin-bottom:\s*0;/,
  "mobile Records heading must not reintroduce a second gap");
assert.doesNotMatch(styles,
  /\.kap-page-shell\.consumption-page \.consumption-table-panel\s*\{[^}]*margin-top:\s*\.325rem/s,
  "Mobile Records must not reintroduce the old 5.2-pixel gap");
assert.match(styles,
  /\.kap-page-shell\.consumption-insights-page \.consumption-page-progress-controls\[data-visible="false"\]\s*\{[^}]*display:\s*none/s,
  "Only the hidden progress host may be removed from flow; the visible loading indicator keeps its existing placement");
assert.match(styles,
  /\.kap-page-shell\.consumption-insights-page \.consumption-page-progress-controls\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*48/s,
  "Analysis and Forecast vs Actual progress must remain viewport-fixed above sticky table headers");
assert.match(styles,
  /\.kap-page-shell\.consumption-insights-page \.consumption-page-progress-controls\[data-visible="true"\]\s*\{[^}]*display:\s*block/s,
  "The visible fixed progress host must not participate in the page layout rhythm");

assert.match(analysis,
  /fetchForecastActualComparison\(\{[\s\S]*?quarter:\s*"ALL"[\s\S]*?actualMode:\s*"FINAL"[\s\S]*?\}\)/,
  "Analysis must reuse the authoritative full-FY Forecast and FINAL Actual comparison endpoint");
assert.match(analysis,
  /forecastComparison\.fiscalYearSummary\.fullPeriodForecastAmount/,
  "FY Forecast must display the stored full-period Forecast total");
assert.match(analysis,
  /forecastComparison\.rows\.flatMap[\s\S]*?month\.forecastAmount\s*!==\s*null[\s\S]*?month\.periodKey/s,
  "FY Forecast coverage must derive from stored monthly entries, not the endpoint's full fiscal-year period list");
assert.match(analysis,
  /subtractExactDecimals\(\s*analysis\.portfolio\.forecastAmountExact,\s*analysis\.portfolio\.forecastOverlapAmountExact\)/s,
  "Remaining Open Forecast must subtract the backend overlap exactly once");
assert.match(analysis, /Closed-period MTD fallback/,
  "Actual to date must disclose closed-period MTD fallback separately");
assert.match(analysis, /Current MTD/,
  "Actual to date must disclose current-month MTD separately when included");

assert.equal(formatForecastCoverage(["FY27-SEP", "FY27-OCT", "FY27-NOV"]), "Partial · Sep–Nov");
assert.equal(formatForecastCoverage(["FY27-SEP", "FY27-NOV"]), "Partial · Sep, Nov",
  "non-contiguous Forecast entry must not imply a filled month");
assert.equal(formatForecastCoverage([
  "FY27-JUN", "FY27-JUL", "FY27-AUG", "FY27-SEP", "FY27-OCT", "FY27-NOV",
  "FY27-DEC", "FY27-JAN", "FY27-FEB", "FY27-MAR", "FY27-APR", "FY27-MAY"
]), "Complete · Jun–May");

console.log("consumption card and page-spacing contract passed");
