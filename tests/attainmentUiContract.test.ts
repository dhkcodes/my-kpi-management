import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consumptionNavItems } from "../src/data/kpiMockData";
import { getNavigationRoute, getNavigationRouteFromPath } from "../src/components/navigationRoutes";

assert.deepEqual(consumptionNavItems.map((item) => item.label), ["Analysis", "Attainment", "Records"]);
assert.equal(consumptionNavItems[1].id, "attainment", "Attainment immediately follows Analysis");
assert.equal(getNavigationRoute("analysis").pageTitle, "Consumption Analysis");
assert.equal(getNavigationRoute("records").pageTitle, "Consumption Records");
assert.equal(getNavigationRoute("attainment").pageTitle, "Consumption Attainment");
assert.equal(getNavigationRoute("attainment").module, "consumptionAttainment");
assert.equal(getNavigationRouteFromPath("/attainment").id, "attainment");

const pageSource = readFileSync("src/components/content/AttainmentPage.tsx", "utf8");
const contentSource = readFileSync("src/components/content/index.tsx", "utf8");
assert.doesNotMatch(pageSource, /Pillar|Quarter filter/i, "Attainment is FY-only");
assert.match(pageSource, /Budget/);
assert.match(pageSource, /oj-dialog/);
assert.match(pageSource, /oj-chart/);
assert.match(pageSource, /seriesId: "Budget Target"/, "Quarter chart includes each quarter's budget target");
assert.match(pageSource, /seriesId: "Actual"/);
assert.match(pageSource, /seriesId: "Forecast"/);
assert.match(pageSource, /value\.toFixed\(0\).*K/, "Chart values are labeled in K without an additional unit conversion");
assert.doesNotMatch(pageSource, /referenceObjects: budgetReference/, "Quarter-varying budgets are data points, not one axis line");
assert.match(pageSource, /Actual Attainment/);
assert.match(pageSource, /Forecast Attainment/);
assert.match(pageSource, /Actual variance to budget/i);
assert.match(pageSource, /Forecast variance to budget/i);
assert.match(pageSource, /Amounts in K/i, "Attainment communicates the K display unit");
assert.match(pageSource, /budget \(K\)/i, "Budget inputs explicitly use K units");
assert.doesNotMatch(pageSource, /scaling: "auto"/, "Chart must not compact already-K amounts into another unit");
assert.match(contentSource, /activeRoute\.module === "consumptionAttainment"[\s\S]*AttainmentPage/);

console.log("attainment UI contract tests passed");
