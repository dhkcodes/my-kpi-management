import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const analysis = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const api = readFileSync("src/data/consumptionApi.ts", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(page, /<PageShell[\s\S]*className="consumption-insights-page forecast-actual-page"/u,
  "Forecast vs Actual uses the shared Consumption Records page shell");
assert.match(page, /PageFilterPanel/u);
assert.match(page, /PageActivity/u);
assert.match(page, /PageDataProgress/u);
assert.match(page, /role="switch"/u);
assert.match(page, /aria-checked=\{actualMode === "MTD"\}/u);
assert.match(page, /disabled=\{loading \|\| !currentData\?\.currentMtdAvailable\}/u);
assert.match(page, /setActualMode\(\(current\) => current === "MTD" \? "FINAL" : "MTD"\)/u);
assert.equal((page.match(/role="switch"/gu) ?? []).length, 1);
assert.match(page, /consumption-pillar-selector[^]*aria-pressed/u, "Pillar uses the same button selector as Consumption Analysis");
assert.match(page, /displayedActualMode === "MTD" && mtdAppliedDate[^]*consumption-mtd-applied-date[^]*Updated on \{mtdAppliedDate\}[^]*role="switch"/u,
  "MTD applied date uses the shared Updated on label and stays with the switch");

assert.match(page, /visibleForecastActualPeriods\(currentData\?\.fullForecastPeriods \?\? \[\], currentData\?\.rows \?\? \[\]\)/u,
  "months stop at the latest period that has a real Forecast value within the selected scope");
assert.doesNotMatch(page, /forecast-actual-period-note/u, "the verbose FY/ALL/month-count row is removed");
assert.doesNotMatch(page, /Full-period summary/u, "the misleading full-period summary header is removed");
assert.doesNotMatch(page, /Amount: K USD/u, "the redundant matrix amount note is removed");
assert.match(page, /colSpan=\{4\} class="forecast-actual-period-group"/u, "each month owns four columns");
for (const label of ["Forecast", "Actual", "Difference", "Status"]) assert.match(page, new RegExp(`forecast-actual-month-subhead[^\\n]*${label}`, "u"));
assert.match(page, /assessForecastActualMonth\(month\)/u, "Difference and status use the explicit month assessment contract");
assert.doesNotMatch(page, /assessment\.differenceLabel/u, "Difference does not repeat a verbose formula label");
assert.match(page, /Projected gap/u);
assert.match(page, /Final gap/u);
assert.match(page, /Pending/u);
assert.match(page, /N\/A/u);
assert.match(page, /statusTooltip/u, "short table labels keep their full meaning in an accessible tooltip");
assert.match(page, /assessForecastActualQuarter/u, "cards and visible rows share one Account-quarter assessment source");
assert.match(page, /FORECAST_ACTUAL_QUARTERS/u);
assert.match(page, /statusAmount\("SHORTFALL"\)/u);
assert.match(page, /statusAmount\("MATCHED"\)/u);
assert.match(page, /statusAmount\("EXCEEDED"\)/u);
assert.match(page, /current\?\.quarter === nextQuarter && current\.status === status \? null : \{ quarter: nextQuarter, status \}/u, "clicking the active quarter result clears it");
assert.match(page, /Matched difference/u, "the exact-zero result remains a clickable amount");
assert.match(page, /zero difference, not the sum of matched Actual/u, "Matched tooltip prevents Actual-total confusion");
assert.match(page, /Total Forecast/u);
assert.match(page, /Total Actual/u);
assert.match(page, /\{displayedResultQuarter\} Result<\/th>/u);
assert.doesNotMatch(page, /Accounts · activate to filter/u, "quarter cards do not display Account counts");

assert.match(styles, /\.forecast-actual-quarter-cards[^}]*grid-template-columns:/u);
assert.match(styles, /\.forecast-actual-quarter-cards[^}]*repeat\(4, minmax\(0, 1fr\)\)/u,
  "the four quarter cards share the available desktop width without forcing overflow");
assert.match(styles, /\.forecast-actual-quarter-actions button[^}]*cursor:\s*pointer/u);
assert.match(styles, /\.forecast-actual-quarter-result\.is-shortfall/u);
assert.match(styles, /\.forecast-actual-quarter-result\.is-matched/u);
assert.match(styles, /\.forecast-actual-quarter-result\.is-exceeded/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-account[^}]*background:/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-rep[^}]*background:/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-rep[^}]*font-weight:\s*700/u);
assert.match(styles, /tr:nth-child\(even\) \.is-account[^}]*background:/u, "striped sticky cells remain opaque");
assert.match(styles, /\.forecast-actual-status-cell[^}]*text-align:\s*center/u);
for (const column of ["is-forecast", "is-actual", "is-difference", "is-status"]) {
  assert.match(styles, new RegExp(`forecast-actual-month-(?:subhead|value)\\.${column}[^}]*background`, "u"), `${column} column has a readable distinguishing background`);
}
assert.doesNotMatch(page, /forecast-actual-month-scroll|consumption-scroll-controls|handleMonthScrollKeyDown|monthScrollRef/u,
  "Forecast vs Actual does not own an internal table scroller or scroll controls");
assert.match(page, /forecast-actual-matrix-layout/u);
assert.match(styles, /\.kap-page-shell\.forecast-actual-page \.kap-page-shell__scroll[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*auto/u,
  "the shared root page shell owns both scroll axes");
assert.match(styles, /\.forecast-actual-matrix-layout[^}]*overflow:\s*visible/u,
  "the matrix layout stays visible instead of clipping right columns or lower rows");
assert.match(styles, /\.forecast-actual-matrix \.is-rep[^}]*text-align:\s*center/u,
  "Sales Rep values are centered");
for (const column of ["is-forecast", "is-actual", "is-difference"]) {
  assert.match(styles, new RegExp(`forecast-actual-month-value\\.${column}[^}]*text-align:\\s*right`, "u"), `${column} values are right aligned`);
}
assert.match(page, /forecast-actual-matrix-toolbar[^]*PageActivity[^]*showBusyLabel=\{false\} compactTimestampButton/u,
  "Reload and completion time use the same compact table-toolbar activity treatment as Consumption Records");
assert.match(styles, /--forecast-rep-width:\s*7rem[^}]*--forecast-month-width:\s*5\.5rem/u,
  "wide Forecast vs Actual columns are compacted without collapsing content");
assert.match(styles, /\.forecast-actual-matrix \.is-rep[^}]*min-width:\s*var\(--forecast-rep-width\)[^}]*width:\s*var\(--forecast-rep-width\)/u,
  "the compact Sales Rep width is applied to the matrix cells");
assert.match(styles, /\.forecast-actual-matrix \.forecast-actual-period-group[^}]*var\(--forecast-month-width\)[^}]*var\(--forecast-status-width\)/u,
  "period groups consume all compacted leaf-column widths");
assert.match(page, /forecast-actual-control forecast-actual-mtd-control[^]*<span>MTD<\/span>[^]*forecast-actual-mtd-row/u,
  "MTD is a field label above its date and toggle row");
assert.match(styles, /\.forecast-actual-matrix \.is-quarter-result[^}]*left:\s*17\.5rem/u,
  "Q2 Result starts immediately after the compact Account and Sales Rep sticky widths");

assert.match(api, /mtdAsOf:\s*string \| null/u);
assert.match(analysis, /analysis\?\.mtdAsOf \?\? analysis\?\.mtdSummary\?\.asOf/u);
assert.match(analysis, /FINAL periods are excluded\. Forecast for an included MTD period remains shown\. Total removes overlapping Forecast once and uses MTD instead\./u);
assert.match(analysis, /\{includeMtd && mtdAppliedDate[\s\S]*<small class="consumption-mtd-applied-date">Updated on \{mtdAppliedDate\}<\/small>/u);

console.log("forecast actual MTD UI contract tests passed");
