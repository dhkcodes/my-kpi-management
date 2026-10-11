import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const selector = readFileSync("src/components/common/FiscalYearSelector.tsx", "utf8");
const consumptionPage = readFileSync("src/components/content/ConsumptionAnalysisPage.tsx", "utf8");
const forecastActualPage = readFileSync("src/components/content/ForecastActualPage.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(selector, /Array\.from\(\{ length: 98 \}, \(_, index\) => fiscalYear\(index \+ 1\)\)/,
  "only FY01 through FY98 are stable Film Strip items");
assert.doesNotMatch(selector, /\.refresh\(\)/,
  "the selector must not refresh the Film Strip when selected FY changes");
assert.match(selector, /lastEmittedRef[\s\S]*next === lastEmittedRef\.current[\s\S]*return/,
  "repeated JET writeback events are deduplicated before changing page FY state");
assert.match(selector, /pendingOffsetsRef\.current\.push\(offset\)/,
  "allowed rapid clicks are queued instead of discarded while a transition is running");
assert.match(selector, /while \(pendingOffsetsRef\.current\.length[\s\S]*await model\.setPage/,
  "allowed queued clicks are drained as one Film Strip transition per click");
assert.match(selector, /Context\.getContext[\s\S]*getBusyContext\(\)\.whenReady/,
  "queue draining waits on the Film Strip's public JET BusyContext");
assert.match(selector, /await model\.setPage[\s\S]*await Context\.getContext/,
  "the next queued click cannot start until the prior visual transition ends");
assert.match(selector, /catch \{[\s\S]*pendingOffsetsRef\.current\.length = 0;[\s\S]*return;/,
  "a JET navigation or readiness failure stops the queue without inventing a selected FY");
assert.match(selector, /looping="off"/,
  "FY01 and FY98 are hard non-wrapping boundaries");
assert.doesNotMatch(selector, /normalizePage|loopDirection/,
  "boundary navigation never wraps");
assert.match(selector, /disabled=\{disabled \|\| selected === FIRST_FISCAL_YEAR\}/,
  "previous is physically disabled at FY01 and while loading");
assert.match(selector, /disabled=\{disabled \|\| selected === LAST_FISCAL_YEAR\}/,
  "next is physically disabled at FY98 and while loading");
assert.match(selector, /disabled\?: boolean/,
  "the selector exposes one loading lock input");
assert.match(selector, /if \(disabledRef\.current\) return/,
  "all FY navigation entry points reject input while loading");
assert.match(selector, /toggleAttribute\("inert", disabled\)/,
  "the Film Strip blocks click, touch, swipe, and keyboard interaction while loading");
assert.match(selector, /aria-disabled=\{disabled \? "true" : "false"\}/,
  "the loading lock is exposed accessibly");
assert.match(consumptionPage, /disabled=\{loading\}/,
  "Consumption Analysis locks FY input exactly while its loading bar is active");
assert.match(forecastActualPage, /disabled=\{loading\}/,
  "Forecast vs Actual locks FY input exactly while its loading bar is active");
assert.match(styles, /\.fiscal-year-selector\s*\{[^}]*height:\s*2\.125rem;[^}]*padding:\s*\.1875rem\s+\.25rem;/s,
  "the Bark capsule remains 34px with 28px navigation buttons");
assert.match(styles, /\.fiscal-year-selector__filmstrip\s*\{[^}]*font-size:\s*\.89rem;/s,
  "the FY label remains 14.24px");
assert.match(styles, /\.fiscal-year-selector__nav:disabled\s*\{/,
  "disabled controls have an explicit subtle Bark/Ivory treatment");
assert.match(styles, /\.kap-page-shell\.consumption-insights-page \.kap-page-shell__title-row,[\s\S]*\.kap-page-shell\.forecast-actual-page \.kap-page-shell__title-row\s*\{[^}]*column-gap:\s*1rem;/s,
  "Analysis and FVA retain the 16px title-to-selector gap");

console.log("fiscal year selector stability contract: ok");
