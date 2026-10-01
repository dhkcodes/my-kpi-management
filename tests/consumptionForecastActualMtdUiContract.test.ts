import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(page, /type="checkbox"/u, "Actual basis uses a compact checkbox switch rather than a select");
assert.match(page, /checked=\{actualMode === "MTD"\}/u, "MTD ON is controlled by the MTD request mode");
assert.match(page, /setActualMode\(event\.currentTarget\.checked \? "MTD" : "FINAL"\)/u,
  "the same switch supports FINAL → MTD → FINAL round trips without resetting other filters");
assert.doesNotMatch(page, /<label>Actual basis<select/u, "the old Actual basis dropdown is removed");
assert.match(page, /월 중간 참고 비교이며 확정 미달 판정이 아님/u,
  "MTD monthly comparison is explicitly separated from finalized shortfall status");
assert.match(page, /MTD 누적액/u);
assert.match(page, /월 Forecast/u);
assert.match(page, /단순 차이/u);
assert.match(styles, /\.forecast-actual-loading[^}]*min-height:\s*0/u,
  "loading state does not reserve a large empty mobile block");
assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.forecast-actual-filters[^}]*margin/u,
  "mobile filters use an explicit compact margin in normal, loading, and error states");

console.log("forecast actual MTD UI contract tests passed");
