import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(page, /role="switch"/u, "Actual basis reuses the compact Consumption MTD switch");
assert.match(page, /aria-checked=\{actualMode === "MTD"\}/u, "MTD ON is controlled by the MTD request mode");
assert.match(page, /setActualMode\(\(current\) => current === "MTD" \? "FINAL" : "MTD"\)/u,
  "the same switch supports FINAL → MTD → FINAL round trips without resetting other filters");
assert.equal((page.match(/role="switch"/gu) ?? []).length, 1, "Actual basis exposes exactly one switch");
assert.doesNotMatch(page, /<label>Actual basis<select/u, "the old Actual basis dropdown is removed");
assert.match(page, /월 중간 참고 비교이며 확정 미달 판정이 아님/u,
  "MTD monthly comparison is explicitly separated from finalized shortfall status");
assert.match(page, /MTD 누적액/u);
assert.match(page, /월 Forecast/u);
assert.match(page, /단순 차이/u);
assert.match(page, /monthEndProjection[^\n]*예상 마감/u,
  "projected month close is labeled separately from Actual");
assert.match(page, /예상 판정 불가[^\n]*예상 기반 주시[^\n]*예상 기준 정상/u,
  "projected status remains explicit for unavailable, watch, and on-track states");
assert.match(page, /aria-sort=\{ariaSort\(/u,
  "sortable headers expose their current direction to assistive technology");
assert.match(page, /compareExactDecimals\(value, "0"\)/u,
  "difference color uses exact decimal comparison so non-canonical zero strings remain neutral");
assert.match(page, /setAccountOptionCache\(\[\]\)/u,
  "dependent filter changes invalidate cached account options");
assert.match(page, /forecastActualPeriodsLatestFirst/u,
  "monthly columns are derived from data-bearing periods in actual fiscal chronology");
assert.match(page, /class="forecast-actual-month-scroll"/u,
  "only the monthly matrix region owns horizontal scrolling");
assert.match(page, /onKeyDown=\{handleMonthScrollKeyDown\}/u,
  "monthly scrolling remains keyboard accessible");
assert.match(page, /consumption-scroll-controls/u,
  "Forecast vs Actual reuses the Consumption Records horizontal controls");
assert.match(page, /consumption-insights-combobox/u);
assert.match(page, /consumption-insights-options/u,
  "Account search reuses the Consumption Analysis combobox appearance");
assert.doesNotMatch(page, /comparisonPeriods\.join/u,
  "the long period list must not overflow through adjacent summary cards");
assert.match(styles, /\.forecast-actual-month-scroll[^}]*scrollbar-width:\s*none/u);
assert.match(styles, /\.forecast-actual-summary article[^}]*min-width:\s*0/u,
  "summary card contents cannot bleed into adjacent cards");
assert.match(styles, /\.forecast-actual-loading[^}]*min-height:\s*0/u,
  "loading state does not reserve a large empty mobile block");
assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.forecast-actual-filters[^}]*margin/u,
  "mobile filters use an explicit compact margin in normal, loading, and error states");

console.log("forecast actual MTD UI contract tests passed");
