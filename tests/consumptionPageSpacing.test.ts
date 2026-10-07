import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const styles = readFileSync(resolve(root, "src/styles/app.css"), "utf8");
const analysis = readFileSync(resolve(root, "src/components/content/ConsumptionAnalysisPage.tsx"), "utf8");
const forecast = readFileSync(resolve(root, "src/components/content/ForecastActualPage.tsx"), "utf8");

assert.match(analysis, /className="consumption-insights-page"/,
  "Analytics must use the shared consumption insights shell class");
assert.match(forecast, /className="consumption-insights-page forecast-actual-page"/,
  "Forecast vs Actual must use the shared consumption insights shell class");
assert.match(styles,
  /\.kap-page-shell\.consumption-insights-page \.kap-page-shell__masthead \+ \.kap-page-filter\s*\{[^}]*margin-top:\s*-\.375rem/s,
  "Analytics and Forecast vs Actual must reduce only the 12px masthead-to-filter gap by 6px to match the Records-standard 6px boundary");

console.log("consumption page spacing contract passed");
