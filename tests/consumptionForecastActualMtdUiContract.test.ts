import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const analysis = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const api = readFileSync("src/data/consumptionApi.ts", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(page, /class="consumption-insights-page forecast-actual-page"/u,
  "Forecast vs Actual uses the Analysis-style document-flow shell and does not trigger the single-row Consumption Records shell");
assert.doesNotMatch(page, /class="consumption-page forecast-actual-page"/u);
assert.match(page, /role="switch"/u);
assert.match(page, /aria-checked=\{actualMode === "MTD"\}/u);
assert.match(page, /disabled=\{loading \|\| !currentData\?\.currentMtdAvailable\}/u);
assert.match(page, /setActualMode\(\(current\) => current === "MTD" \? "FINAL" : "MTD"\)/u);
assert.equal((page.match(/role="switch"/gu) ?? []).length, 1);

const mtdIndex = page.indexOf("forecast-actual-mtd-control");
const quarterIndex = page.indexOf("forecastActualQuarter");
const pillarIndex = page.indexOf("forecast-actual-pillar");
const salesRepIndex = page.indexOf("forecastActualSalesRep");
const accountIndex = page.indexOf("forecastActualAccountSearch");
assert.ok(mtdIndex >= 0 && mtdIndex < quarterIndex && quarterIndex < pillarIndex && pillarIndex < salesRepIndex && salesRepIndex < accountIndex,
  "title-side filters remain MTD, Quarter, Pillar, Sales Rep, Account in order");
assert.match(page, /consumption-pillar-selector[^]*aria-pressed/u, "Pillar uses the same button selector as Consumption Analysis");
assert.match(page, /displayedActualMode === "MTD" && mtdAppliedDate[^]*consumption-mtd-applied-date[^]*As of \{mtdAppliedDate\}[^]*role="switch"/u,
  "MTD applied date uses the shared As of label and stays to the left of the switch");

assert.match(page, /visibleForecastActualPeriods\(currentData\?\.fullForecastPeriods \?\? \[\], currentData\?\.rows \?\? \[\]\)/u,
  "months stop at the latest period that has a real Forecast value within the selected scope");
assert.doesNotMatch(page, /forecast-actual-period-note/u, "the verbose FY/ALL/month-count row is removed");
assert.doesNotMatch(page, /Full-period summary/u, "the misleading full-period summary header is removed");
assert.match(page, /forecast-actual-unit-note[^]*K USD/u, "the K unit remains as a concise standalone note");
assert.match(page, /colSpan=\{4\} class="forecast-actual-period-group"/u, "each month owns four columns");
for (const label of ["Forecast", "Actual", "Difference", "Status"]) assert.match(page, new RegExp(`forecast-actual-month-subhead[^\\n]*${label}`, "u"));
assert.match(page, /assessForecastActualMonth\(month\)/u, "Difference and status use the explicit month assessment contract");
assert.doesNotMatch(page, /assessment\.differenceLabel/u, "Difference does not repeat a verbose formula label");
assert.match(page, /Projected gap/u);
assert.match(page, /Final gap/u);
assert.match(page, /Pending/u);
assert.match(page, /N\/A/u);
assert.match(page, /statusTooltip/u, "short table labels keep their full meaning in an accessible tooltip");
assert.match(page, /forecast-actual-info-trigger/u, "each summary card exposes a keyboard and touch reachable explanation");
assert.match(page, /forecast-actual-card-highlight/u, "important numbers in summary detail text are highlighted");
assert.match(page, /forecast-actual-status-cell/u, "monthly status badges have a dedicated centered cell");
assert.match(page, /forecast-actual-status[^>]*data-tooltip=[^>]*aria-label=[^>]*tabIndex=\{0\}/u, "status details are reachable by hover, keyboard focus, and touch focus");

assert.match(page, /countForecastActualProblemAccounts/u);
assert.match(page, /FINAL_SHORTFALL/u);
assert.match(page, /MTD_SHORTFALL/u);
assert.match(page, /setProblemFilter\(\(current\) => current ===/u, "clicking an active problem card clears it");
assert.match(page, /filterForecastActualProblemRows/u, "problem cards and visible rows share one assessment source");
assert.match(page, /summarizeForecastActualActuals/u, "Actual total keeps confirmed and MTD components distinct");
assert.match(page, /Final <strong class="forecast-actual-card-highlight">\{formatAmount\(actualTotals\.confirmedAmount, "None"\)\}<\/strong>/u);
assert.match(page, /Accounts are counted once\./u, "the card aggregation unit is explained by the accessible card tooltip");
assert.match(page, /Accounts · activate to filter/u, "exception cards explain their filter action");

assert.match(styles, /\.forecast-actual-toolbar[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-account[^}]*background:/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-rep[^}]*background:/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-rep[^}]*font-weight:\s*700/u);
assert.match(styles, /tr:nth-child\(even\) \.is-account[^}]*background:/u, "striped sticky cells remain opaque");
assert.match(styles, /\.forecast-actual-status-cell[^}]*text-align:\s*center/u);
for (const column of ["is-forecast", "is-actual", "is-difference", "is-status"]) {
  assert.match(styles, new RegExp(`forecast-actual-month-(?:subhead|value)\\.${column}[^}]*background`, "u"), `${column} column has a readable distinguishing background`);
}
assert.match(styles, /\.forecast-actual-info-trigger:hover::after[^}]*opacity:\s*1/u, "card help opens on pointer hover");
assert.match(styles, /\.forecast-actual-info-trigger:focus::after[^}]*opacity:\s*1/u, "card help opens from keyboard or touch focus");
assert.match(styles, /\.forecast-actual-month-scroll[^}]*max-height:[^;}]+[^}]*overflow:\s*auto/u);
assert.match(styles, /\.forecast-actual-matrix \.is-rep[^}]*text-align:\s*center/u,
  "Sales Rep values are centered");
for (const column of ["is-forecast", "is-actual", "is-difference"]) {
  assert.match(styles, new RegExp(`forecast-actual-month-value\\.${column}[^}]*text-align:\\s*right`, "u"), `${column} values are right aligned`);
}
assert.match(styles, /\.forecast-actual-summary article[^}]*overflow:\s*visible/u,
  "summary help popovers are not clipped by their cards");
assert.match(styles, /\.forecast-actual-matrix-shell > \.consumption-scroll-controls[^}]*top:\s*50%[^}]*transform:\s*translateY\(-50%\)/u,
  "horizontal scroll buttons stay at the visible matrix midpoint");
assert.match(styles, /--forecast-rep-width:\s*7rem[^}]*--forecast-month-width:\s*5\.5rem/u,
  "wide Forecast vs Actual columns are compacted without collapsing content");
assert.match(styles, /\.forecast-actual-matrix \.is-rep[^}]*min-width:\s*var\(--forecast-rep-width\)[^}]*width:\s*var\(--forecast-rep-width\)/u,
  "the compact Sales Rep width is applied to the matrix cells");
assert.match(styles, /\.forecast-actual-matrix \.forecast-actual-period-group[^}]*var\(--forecast-month-width\)[^}]*var\(--forecast-status-width\)/u,
  "period groups consume all compacted leaf-column widths");
assert.match(page, /forecast-actual-control forecast-actual-mtd-control[^]*<span>MTD<\/span>[^]*forecast-actual-mtd-row/u,
  "MTD is a field label above its date and toggle row");
assert.match(page, /onKeyDown=\{handleMonthScrollKeyDown\}/u);

assert.match(api, /mtdAsOf:\s*string \| null/u);
assert.match(analysis, /analysis\?\.mtdAsOf \?\? analysis\?\.mtdSummary\?\.asOf/u);
assert.doesNotMatch(analysis, /MTD period/u);
assert.match(analysis, /\{includeMtd && mtdAppliedDate[\s\S]*<small class="consumption-mtd-applied-date">As of \{mtdAppliedDate\}<\/small>/u);

console.log("forecast actual MTD UI contract tests passed");
