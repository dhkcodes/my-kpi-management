import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const selector = readFileSync("src/components/common/FiscalYearSelector.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

assert.match(selector, /Array\.from\(\{ length: 100 \}/,
  "the two-digit FY namespace is generated once so response renders do not replace Film Strip items");
assert.doesNotMatch(selector, /\.refresh\(\)/,
  "the selector must not refresh the Film Strip when selected FY changes");
assert.match(selector, /lastEmittedRef[\s\S]*next === lastEmittedRef\.current[\s\S]*return/,
  "repeated JET writeback events are deduplicated before changing page FY state");
assert.match(selector, /pendingOffsetsRef\.current\.push\(offset\)/,
  "rapid clicks are queued instead of discarded while a transition is running");
assert.match(selector, /while \(pendingOffsetsRef\.current\.length\)[\s\S]*await model\.setPage/,
  "queued clicks are drained as one Film Strip transition per click");
assert.match(selector, /Context\.getContext[\s\S]*getBusyContext\(\)\.whenReady/,
  "queue draining waits on the Film Strip's public JET BusyContext");
assert.match(selector, /await model\.setPage[\s\S]*await Context\.getContext/,
  "the next queued click cannot start until the prior visual transition ends");
assert.match(selector, /catch \{[\s\S]*pendingOffsetsRef\.current\.length = 0;[\s\S]*return;/,
  "a JET navigation or readiness failure stops the queue without inventing a selected FY");
assert.match(selector, /looping="page"/,
  "the complete FY namespace wraps without an arbitrary past or future edge");
assert.match(selector, /wrapsNamespace[\s\S]*loopDirection: offset === -1 \? "prev" : "next"/,
  "FY99/FY00 wrap transitions retain the direction of the clicked arrow");
assert.match(styles, /\.fiscal-year-selector\s*\{[^}]*height:\s*2\.125rem;[^}]*padding:\s*\.1875rem\s+\.25rem;/s,
  "the Bark capsule is reduced from 36px to 34px without shrinking the 28px navigation buttons");
assert.match(styles, /\.fiscal-year-selector__filmstrip\s*\{[^}]*font-size:\s*\.89rem;/s,
  "the FY label is increased from 13.44px to 14.24px");
assert.match(styles, /\.kap-page-shell\.consumption-insights-page \.kap-page-shell__title-row,[\s\S]*\.kap-page-shell\.forecast-actual-page \.kap-page-shell__title-row\s*\{[^}]*column-gap:\s*1rem;/s,
  "Analysis and FVA increase the title-to-selector gap from 12px to 16px");

console.log("fiscal year selector stability contract: ok");
