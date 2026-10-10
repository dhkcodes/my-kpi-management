import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const analysis = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const mtdControl = readFileSync("src/components/content/ConsumptionMtdControl.tsx", "utf8");
const fiscalYearSelector = readFileSync("src/components/common/FiscalYearSelector.tsx", "utf8");
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
assert.match(page, /Total Actual<\/small>[\s\S]*<strong>\{formatAmount\(selectedTotalActual, "N\/A"\)\}<\/strong>/u,
  "the redundant K USD label and duplicate K suffix are removed while MTD stays inline with Total Actual");
assert.doesNotMatch(page, /<small>K USD<\/small>/u,
  "quarter cards do not render the redundant K USD caption");
assert.doesNotMatch(page, /`\$\{formatAmount\(quarterResult\.relevantAmount\)\} K`/u,
  "quarter-result rows do not append a second K unit to the formatted amount");
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

assert.match(styles, /\.fiscal-year-selector__trigger:hover,[\s\S]*\.fiscal-year-selector__trigger\[aria-expanded="true"\]\s*\{[^}]*background:\s*#eef7f4[^}]*color:\s*#182027/u,
  "opening or selecting the fiscal-year trigger preserves the light visual treatment");
assert.match(styles, /\.fiscal-year-selector__trigger:focus-visible[^}]*box-shadow:\s*0 0 0 2px/iu,
  "the light fiscal-year treatment retains a visible keyboard focus indicator");
assert.match(styles, /\.fiscal-year-selector__trigger,[\s\S]*\.fiscal-year-selector__nav,[\s\S]*\.fiscal-year-selector__row\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/iu,
  "touch interaction cannot leave a browser tap highlight on any fiscal-year control");
assert.equal((fiscalYearSelector.match(/class="fiscal-year-selector__nav"/gu) ?? []).length, 2,
  "both fiscal-year range navigation buttons receive the shared light-state class");
assert.match(styles, /\.fiscal-year-selector__nav:hover,[\s\S]*\.fiscal-year-selector__navigation button:focus-visible\s*\{[^}]*background:\s*#eef7f4/iu,
  "fiscal-year navigation controls stay light for hover, press, and keyboard focus across deployed and updated markup");
assert.match(styles, /\.fiscal-year-selector__row:hover,[\s\S]*\.fiscal-year-selector__row:active,[\s\S]*\.fiscal-year-selector__row:focus-visible\s*\{[^}]*background:\s*#eef7f4/iu,
  "fiscal-year options stay light for hover, press, and keyboard focus");
assert.match(styles, /\.fiscal-year-selector__row\.is-selected\s*\{[^}]*background:\s*#eef7f4[^}]*box-shadow:/iu,
  "the selected fiscal year stays light while remaining visibly distinct");
assert.doesNotMatch(styles, /\.fiscal-year-selector__(?:trigger|nav|row)[^\{]*\{[^}]*background:\s*#(?:006b54|004f3f|0b6b57)/iu,
  "no fiscal-year interaction state uses the former dark teal background");
assert.match(styles, /\.forecast-actual-total-strip\s*\{[^}]*display:\s*flex/iu,
  "Total Actual and Forecast remain in the Show MTD toolbar row");
assert.match(styles, /\.kap-page-shell\.forecast-actual-page \.forecast-actual-data-toolbar\s*\{[^}]*align-items:\s*center/iu,
  "Show MTD, totals and Reload are vertically centered in one toolbar row");
assert.match(styles, /@media\s*\(max-width:\s*600px\)[\s\S]*\.forecast-actual-data-toolbar\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto[^}]*align-items:\s*center/iu,
  "mobile portrait gives Show MTD, totals, and Reload independent centered grid columns");
assert.match(styles, /@media\s*\(max-width:\s*600px\)[\s\S]*\.forecast-actual-toolbar-summary\s*\{[^}]*display:\s*contents/iu,
  "mobile portrait lets the totals bundle align against the complete toolbar row rather than a wrapped summary column");
assert.match(styles, /@media\s*\(max-width:\s*600px\)[\s\S]*\.forecast-actual-total-strip\s*\{[^}]*align-self:\s*center[^}]*justify-self:\s*center/iu,
  "the mobile totals bundle itself is centered within the full toolbar row");
assert.match(styles, /@media\s*\(max-width:\s*600px\)[\s\S]*\.forecast-actual-data-toolbar \.kap-page-activity\s*\{[^}]*align-self:\s*center[^}]*justify-self:\s*end[^}]*width:\s*auto/iu,
  "the real PageActivity element remains centered in the same mobile grid row");
assert.match(styles, /\.forecast-actual-total-strip > span,[\s\S]*\.forecast-actual-total-strip span\s*\{[^}]*align-items:\s*baseline[^}]*display:\s*inline-flex/iu,
  "the amount and MTD label share an inline baseline");
assert.match(styles, /@media\s*\(min-width:\s*601px\)[\s\S]*\.forecast-actual-total-strip small,[\s\S]*\.forecast-actual-total-strip strong\s*\{[^}]*line-height:\s*2rem/iu,
  "wide-row totals use the Show MTD control height as their typographic line box, not a positional offset");
assert.doesNotMatch(styles, /@media\s*\(min-width:\s*601px\)[\s\S]*\.forecast-actual-total-strip (?:small|strong)\s*\{[^}]*(?:transform|top|translate|margin-top):/iu,
  "wide-row visible alignment is not implemented with an unexplained positional correction");
assert.match(page, /class="forecast-actual-cell-center"[^]*forecast-actual-value-badge is-no-forecast/iu,
  "No FCST is wrapped by a full-cell centering container");
assert.match(page, /class="forecast-actual-cell-center"[^]*forecast-actual-value-badge is-pending/iu,
  "Actual Pending is wrapped by a full-cell centering container");
assert.ok((page.match(/class="forecast-actual-cell-center"/gu) ?? []).length >= 6,
  "both absent-month and partial-month state badges use the whole-cell centering wrapper");
assert.match(styles, /\.forecast-actual-cell-center\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*width:\s*100%/iu,
  "status badge containers center the badge itself across the complete cell");

assert.match(api, /mtdAsOf:\s*string \| null/u);
assert.match(analysis, /analysis\?\.mtdAsOf \?\? analysis\?\.mtdSummary\?\.asOf/u);
assert.match(analysis, /Open Forecast selection excludes FINAL periods\. Forecast for an included MTD period remains shown\. Total removes overlapping Forecast once and uses MTD instead\./u);
assert.match(analysis, /<ConsumptionMtdControl[^]*mtdAppliedDate=\{mtdAppliedTimestamp\}/u);

console.log("forecast actual MTD UI contract tests passed");
