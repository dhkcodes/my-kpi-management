import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const analysis = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const mtdControl = readFileSync("src/components/content/ConsumptionMtdControl.tsx", "utf8");
const api = readFileSync("src/data/consumptionApi.ts", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(page, /<PageShell[\s\S]*className="consumption-insights-page forecast-actual-page"/u,
  "Forecast vs Actual uses the shared Consumption Records page shell");
assert.match(page, /PageFilterPanel/u);
assert.match(page, /PageActivity/u);
assert.match(page, /PageDataProgress/u);
assert.match(mtdControl, /role="switch"/u);
assert.match(mtdControl, /aria-checked=\{checked\}/u);
assert.match(mtdControl, /disabled=\{disabled\}/u);
assert.match(mtdControl, /onClick=\{onToggle\}/u);
assert.equal((mtdControl.match(/role="switch"/gu) ?? []).length, 1);
assert.match(page, /checked=\{actualMode === "MTD"\}/u);
assert.match(page, /disabled=\{loading \|\| !currentData\?\.currentMtdAvailable\}/u);
assert.match(page, /mtdAppliedDate=\{mtdAppliedTimestamp\}/u);
assert.match(page, /actualMode === "FINAL"[^]*actualMode: "MTD"[^]*setMtdAppliedTimestamp/u,
  "the tooltip fetches and retains the real MTD timestamp while Show MTD is off");
assert.match(page, /onToggle=\{\(\) => \{ setResultFilter\(null\); setActualMode\(\(current\) => current === "MTD" \? "FINAL" : "MTD"\); \}\}/u);
assert.match(page, /consumption-pillar-selector[^]*aria-pressed/u, "Pillar uses the same button selector as Consumption Analysis");
assert.match(mtdControl, /formatMtdAppliedDate\(mtdAppliedDate \?\? null\)[^]*Updated on \{updatedOn\}/u,
  "the shared MTD tooltip derives its Updated on date from the real period metadata");
assert.match(mtdControl, /aria-describedby=\{tooltipId\}[^]*consumption-info-tooltip__content/u,
  "only the dedicated information trigger owns the shared MTD tooltip");

assert.match(page, /visibleForecastActualPeriods\(currentData\?\.fullForecastPeriods \?\? \[\], currentData\?\.rows \?\? \[\]\)/u,
  "the visible calendar merges the server fiscal calendar with value-bearing row periods");
assert.doesNotMatch(page, /forecast-actual-period-note/u, "the verbose FY/ALL/month-count row is removed");
assert.doesNotMatch(page, /Full-period summary/u, "the misleading full-period summary header is removed");
assert.match(page, /const formatAmount = \(value: string \| null, unavailable = "Unconfirmed"\) => value === null \? unavailable : formatExactKFixed\(value, 2\)/u,
  "amount formatter retains the K unit");
assert.match(page, /Total Actual<\/small><span class="forecast-actual-total-value"><strong>\{formatAmount\(selectedTotalActual, "N\/A"\)\}<\/strong>/u,
  "the redundant K USD label and duplicate K suffix are removed while MTD stays inline with Total Actual");
assert.doesNotMatch(page, /<small>K USD<\/small>/u,
  "quarter cards do not render the redundant K USD caption");
assert.match(page, /colSpan=\{4\} class="forecast-actual-period-group"/u, "each month owns four columns");
for (const label of ["Forecast", "Actual", "Difference", "Status"]) assert.match(page, new RegExp(`forecast-actual-month-subhead[^\\n]*${label}`, "u"));
assert.match(page, /assessForecastActualMonth\(month\)/u, "Difference and status use the explicit month assessment contract");
assert.doesNotMatch(page, /assessment\.differenceLabel/u, "Difference does not repeat a verbose formula label");
assert.match(page, /Projected Shortfall/u);
assert.match(page, /Confirmed Shortfall/u);
assert.match(page, /Actual Pending/u);
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
assert.match(page, /forecast-actual-viewport-controls[^]*scrollMatrix\(-1\)[^]*scrollMatrix\(1\)/u,
  "Forecast vs Actual exposes the standard horizontal navigation controls");
assert.match(page, /forecast-actual-matrix-shell/u);
assert.match(styles, /\.forecast-actual-matrix-shell[^}]*overflow-x:\s*auto/u,
  "the matrix shell owns horizontal scrolling");
assert.match(styles, /\.consumption-viewport-controls[^}]*position:\s*fixed/u,
  "horizontal controls remain available while the matrix is vertically visible");
assert.match(styles, /\.forecast-actual-matrix \.is-rep[^}]*text-align:\s*center/u,
  "Sales Rep values are centered");
for (const column of ["is-forecast", "is-actual", "is-difference"]) {
  assert.match(styles, new RegExp(`forecast-actual-month-value\\.${column}[^}]*text-align:\\s*right`, "u"), `${column} values are right aligned`);
}
assert.match(page, /forecast-actual-data-toolbar[^]*PageActivity[^]*showBusyLabel=\{false\}[^]*compactTimestampButton/u,
  "Reload and completion time use the same compact table-toolbar activity treatment as Consumption Records");
assert.match(styles, /--forecast-rep-width:\s*7rem/u);
assert.match(styles, /--forecast-month-width:\s*5\.6rem/u,
  "wide Forecast vs Actual columns are compacted without collapsing content");
assert.match(styles, /\.forecast-actual-matrix \.is-rep[^}]*min-width:\s*var\(--forecast-rep-width\)[^}]*width:\s*var\(--forecast-rep-width\)/u,
  "the compact Sales Rep width is applied to the matrix cells");
assert.match(styles, /\.forecast-actual-matrix \.forecast-actual-period-group[^}]*var\(--forecast-month-width\)[^}]*var\(--forecast-status-width\)/u,
  "period groups consume all compacted leaf-column widths");
assert.match(page, /forecast-actual-data-toolbar[^]*<ConsumptionMtdControl[^]*tooltipId="forecast-show-mtd-tooltip"/u,
  "Forecast vs Actual wires the shared Show MTD control into its data toolbar");
assert.match(styles, /\.forecast-actual-matrix \.is-quarter-result[^}]*left:\s*17\.5rem/u,
  "Q2 Result starts immediately after the compact Account and Sales Rep sticky widths");

const fiscalYearFocusRule = styles.match(/\.consumption-analysis-fy-menu \.oj-menu-item:not\(\.oj-disabled\)\.oj-focus\s*\{([^}]*)\}/u)?.[1] ?? "";
assert.match(fiscalYearFocusRule, /--oj-core-bg-color-hover:\s*#0b607d/iu,
  "the live JET popup focus state receives the requested FY hover background");
assert.match(fiscalYearFocusRule, /--oj-menu-item-text-color:\s*#fff(?:fff)?/iu,
  "the live JET popup focus state receives white text");
const fiscalYearMenuRules = [...styles.matchAll(/oj-menu\.consumption-analysis-fy-menu[^\{]*\{([^}]*)\}/gu)]
  .map((match) => match[1]).join("\n");
assert.doesNotMatch(fiscalYearMenuRules, /--oj-menu-item-(?:bg-color-hover|bg-color-focus|text-color-hover|text-color-focus)/u,
  "unsupported JET menu custom properties must not masquerade as a hover implementation");

const totalValueRules = [...styles.matchAll(/\.forecast-actual-total-value\s*\{([^}]*)\}/gu)];
const effectiveTotalValueRule = totalValueRules[totalValueRules.length - 1]?.[1] ?? "";
assert.match(styles, /\.forecast-actual-total-strip\s+\.forecast-actual-total-value\s*\{[^}]*display:\s*inline-flex/iu,
  "the matching descendant selector must outrank the generic .forecast-actual-total-strip span grid rule");
assert.match(effectiveTotalValueRule, /display:\s*inline-flex/u,
  "the final Total Actual value rule keeps MTD horizontally inline");
assert.match(effectiveTotalValueRule, /flex-wrap:\s*nowrap/u,
  "the Total Actual amount and MTD do not stack at the compact card width");
assert.match(effectiveTotalValueRule, /align-items:\s*baseline/u,
  "the amount and existing-size MTD label share a readable baseline");
assert.doesNotMatch(effectiveTotalValueRule, /grid-template-columns|display:\s*(?:inline-)?grid/u,
  "a later compact-card override must not put Total Actual MTD back on a second row");

assert.match(api, /mtdAsOf:\s*string \| null/u);
assert.match(analysis, /analysis\?\.mtdAsOf \?\? analysis\?\.mtdSummary\?\.asOf/u);
assert.match(analysis, /Open Forecast selection excludes FINAL periods\. Forecast for an included MTD period remains shown\. Total removes overlapping Forecast once and uses MTD instead\./u);
assert.match(analysis, /<ConsumptionMtdControl[^]*mtdAppliedDate=\{mtdAppliedTimestamp\}/u);

console.log("forecast actual MTD UI contract tests passed");
