import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consumptionNavItems } from "../src/data/kpiMockData";
import { getNavigationRoute, getNavigationRouteFromPath } from "../src/components/navigationRoutes";

assert.deepEqual(consumptionNavItems.map((item) => item.label), ["Consumption Insight", "Attainment", "Consumption Records"]);
assert.equal(consumptionNavItems[1].id, "attainment", "Attainment immediately follows Consumption Insight");
assert.equal(getNavigationRoute("usage-insights").pageTitle, "Consumption Insight");
assert.equal(getNavigationRoute("usage-records").pageTitle, "Consumption Records");
assert.equal(getNavigationRoute("attainment").module, "attainment");
assert.equal(getNavigationRouteFromPath("/attainment").id, "attainment");

const pageSource = readFileSync("src/components/content/AttainmentPage.tsx", "utf8");
const contentSource = readFileSync("src/components/content/index.tsx", "utf8");
assert.doesNotMatch(pageSource, /Pillar|Quarter filter/i, "Attainment is FY-only");
assert.match(pageSource, /Budget/);
assert.match(pageSource, /oj-dialog/);
assert.match(pageSource, /oj-chart/);
assert.match(pageSource, /Actual Attainment/);
assert.match(pageSource, /Forecast Attainment/);
assert.match(pageSource, /Actual variance to budget/i);
assert.match(pageSource, /Forecast variance to budget/i);
assert.match(contentSource, /activeRoute\.module === "attainment"[\s\S]*AttainmentPage/);

console.log("attainment UI contract tests passed");
