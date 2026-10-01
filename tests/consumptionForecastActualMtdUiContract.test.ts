import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const analysis = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const api = readFileSync("src/data/consumptionApi.ts", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(page, /role="switch"/u, "Actual basis reuses the compact Consumption MTD switch");
assert.match(page, /aria-checked=\{actualMode === "MTD"\}/u);
assert.match(page, /setActualMode\(\(current\) => current === "MTD" \? "FINAL" : "MTD"\)/u,
  "MTD round trips do not reset other filters");
assert.equal((page.match(/role="switch"/gu) ?? []).length, 1);
assert.doesNotMatch(page, /월 중간 참고 비교이며 확정 미달 판정이 아님/u,
  "the verbose MTD note is removed while mode-specific values remain distinct");
assert.doesNotMatch(page, /Confirmed/u, "user-facing Confirmed wording is removed");
assert.match(page, />Forecast</u);
assert.match(page, />Actual</u);
assert.match(page, />Difference</u);
assert.match(page, /Full-period/u);
assert.match(page, /FINAL periods only/u);
assert.match(page, /미확정/u);
assert.match(page, /비교 불가/u);
assert.match(page, /is-summary-difference[^\n]*formatAmount\(row\.differenceAmount, "비교 불가"\)/u,
  "summary Difference uses 비교 불가 rather than the Actual-cell 미확정 state");
assert.match(page, /const differenceText = month\.actualAmount === null \|\| month\.forecastAmount === null \? "비교 불가"/u,
  "monthly Difference is 비교 불가 whenever either operand is missing");
assert.match(page, /formatExactKFixed\(value, 2\)/u,
  "all Forecast vs Actual amounts use a single exact base-currency-to-K formatter");
assert.match(page, /summary\.accountCount/u, "account counts stay as counts rather than K currency");
assert.match(page, /colSpan=\{3\} class="forecast-actual-period-group"/u,
  "each month owns a three-column group");
assert.match(page, /forecast-actual-month-subhead[^\n]*Forecast/u);
assert.match(page, /forecast-actual-month-subhead[^\n]*Actual/u);
assert.match(page, /forecast-actual-month-subhead[^\n]*Difference/u);
assert.match(page, /예상 판정/u);
assert.match(page, /"불가"[^\n]*"주의"[^\n]*"정상"/u,
  "projection status is a separate three-state badge");
assert.doesNotMatch(page, /확정 실적 충족/u);
assert.match(page, /forecast-actual-search-panel/u,
  "account search is part of the title-side header layout");
assert.match(styles, /grid-template-columns:\s*minmax\(13rem, 1fr\)\s+minmax\(15rem, 24rem\)\s+auto/u);
assert.match(styles, /\.forecast-actual-group-header th[^}]*background:/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-account[^}]*background:/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-rep[^}]*background:/u);
assert.match(styles, /\.forecast-actual-subheader th[^}]*top:/u,
  "second-level grouped headers remain sticky below month headers");
assert.match(styles, /\.forecast-actual-month-scroll[^}]*max-height:[^;}]+[^}]*overflow:\s*auto/u);
assert.match(page, /onKeyDown=\{handleMonthScrollKeyDown\}/u);
assert.doesNotMatch(page, /setData\(null\);\s*setLoading\(true\)/u,
  "filter refresh keeps the existing result mounted");
assert.match(styles, /\.forecast-actual-loading[^}]*position:\s*absolute/u,
  "initial loading status does not push the eventual matrix down");
assert.match(page, /const actualDifference = month\.actualState === "MTD"[\s\S]*subtractExactDecimals\(month\.actualAmount, month\.forecastAmount\)/u,
  "MTD mode keeps monthly values and computes difference only from matching month values");
assert.match(api, /mtdAsOf:\s*string \| null/u,
  "Analysis carries authoritative MTD import metadata independently of MTD amount inclusion");
assert.match(analysis, /analysis\?\.mtdAsOf \?\? analysis\?\.mtdSummary\?\.asOf/u);
assert.match(analysis, /\{mtdAppliedDate \? <small class="consumption-mtd-applied-date">/u,
  "Analysis displays authoritative date whenever the API provides it");
assert.match(styles, /\.consumption-mtd-applied-date[^}]*background:[^}]*font-weight:\s*700/u,
  "MTD applied date is visibly highlighted");
assert.match(page, /forecastActualPeriodsLatestFirst/u,
  "Forecast-bearing latest-first periods remain preserved");

console.log("forecast actual MTD UI contract tests passed");
