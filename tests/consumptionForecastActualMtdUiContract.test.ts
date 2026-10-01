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
assert.match(page, /displayedActualMode === "MTD" && mtdAppliedDate[^]*consumption-mtd-applied-date[^]*role="switch"/u,
  "MTD applied date stays to the left of the switch");

assert.match(page, /visibleForecastActualPeriods\(currentData\?\.fullForecastPeriods \?\? \[\], currentData\?\.rows \?\? \[\]\)/u,
  "months stop at the latest period that has a real Forecast value within the selected scope");
assert.doesNotMatch(page, /forecast-actual-period-note/u, "the verbose FY/ALL/month-count row is removed");
assert.doesNotMatch(page, /Full-period summary/u, "the misleading full-period summary header is removed");
assert.match(page, /forecast-actual-unit-note[^]*K USD/u, "the K unit remains as a concise standalone note");
assert.match(page, /colSpan=\{4\} class="forecast-actual-period-group"/u, "each month owns four columns");
for (const label of ["Forecast", "Actual", "Difference", "Status"]) assert.match(page, new RegExp(`forecast-actual-month-subhead[^\\n]*${label}`, "u"));
assert.match(page, /assessForecastActualMonth\(month\)/u, "Difference and status use the explicit month assessment contract");
assert.doesNotMatch(page, /assessment\.differenceLabel/u, "Difference does not repeat a verbose formula label");
assert.match(page, /Projected MTD shortfall/u);
assert.match(page, /Final shortfall/u);
assert.match(page, /Unconfirmed/u);
assert.match(page, /Not comparable/u);
assert.match(page, /forecast-actual-status-cell/u, "monthly status badges have a dedicated centered cell");

assert.match(page, /countForecastActualProblemAccounts/u);
assert.match(page, /FINAL_SHORTFALL/u);
assert.match(page, /MTD_SHORTFALL/u);
assert.match(page, /setProblemFilter\(\(current\) => current ===/u, "clicking an active problem card clears it");
assert.match(page, /filterForecastActualProblemRows/u, "problem cards and visible rows share one assessment source");
assert.match(page, /summarizeForecastActualActuals/u, "Actual total keeps confirmed and MTD components distinct");
assert.match(page, /Final \$\{formatAmount\(actualTotals\.confirmedAmount/u);
assert.match(page, /Accounts are counted once; activate to filter rows/u, "the card aggregation unit is explained by the accessible card tooltip");

assert.match(styles, /\.forecast-actual-toolbar[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-account[^}]*background:/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-rep[^}]*background:/u);
assert.match(styles, /\.forecast-actual-matrix tbody \.is-rep[^}]*font-weight:\s*700/u);
assert.match(styles, /tr:nth-child\(even\) \.is-account[^}]*background:/u, "striped sticky cells remain opaque");
assert.match(styles, /\.forecast-actual-status-cell[^}]*text-align:\s*center/u);
assert.match(styles, /\.forecast-actual-month-scroll[^}]*max-height:[^;}]+[^}]*overflow:\s*auto/u);
assert.match(page, /onKeyDown=\{handleMonthScrollKeyDown\}/u);

assert.match(api, /mtdAsOf:\s*string \| null/u);
assert.match(analysis, /analysis\?\.mtdAsOf \?\? analysis\?\.mtdSummary\?\.asOf/u);
assert.match(analysis, /\{mtdPeriodLabel && mtdAppliedDate[\s\S]*<small class="consumption-mtd-applied-date">MTD period \{mtdPeriodLabel\} · as of \{mtdAppliedDate\}<\/small>/u);

console.log("forecast actual MTD UI contract tests passed");
