import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyConsumptionAccountForecastResolutions, applyConsumptionMtdDisplayOverride, buildDisplayQuarterSummaries, resolveConsumptionMonthDisplay, sortConsumptionQuartersNewestFirst } from "../src/data/consumptionData";
import { validateForecastWorkbookFile } from "../src/data/forecastWorkbookValidation";

const source = {
  id: "future", customer: "Future", endUser: "", planId: "", dataCenter: "", planType: "Aggregate" as const, plans: [],
  actuals: { "FY27-DEC": 0 }, actualsExact: { "FY27-DEC": "0" },
  forecasts: { "FY27-DEC": 999, "FY27-JAN": 20, "FY27-FEB": 30, "FY28-JUN": 40 },
  forecastsExact: { "FY27-DEC": "999", "FY27-JAN": "20", "FY27-FEB": "30", "FY28-JUN": "40" }
};
const resolved = applyConsumptionAccountForecastResolutions(source, [
  { period: "FY27-DEC", editable: true, amount: 999, amountExact: "999" },
  { period: "FY27-JAN", editable: false, amount: 20, amountExact: "20" },
  { period: "FY28-JUN", editable: false, amount: 40, amountExact: "40" }
]);
assert.equal(resolved.forecastsExact?.["FY27-JAN"], "20", "permissions must not discard a future Forecast");
assert.equal(resolved.forecastsExact?.["FY28-JUN"], "40", "later FY Forecast remains visible when read-only");
assert.equal(resolved.actualsExact?.["FY27-DEC"], "0", "FINAL Actual zero is authoritative");
assert.equal(resolved.forecastsExact?.["FY27-DEC"], undefined, "editability cannot override an Actual");
const q3 = buildDisplayQuarterSummaries(resolved, ["FY27-Q3"])[0];
assert.equal(q3.totalExact, "50", "Q3 Total uses the same Actual-first values as the cells");
assert.equal(source.forecastsExact["FY27-DEC"], "999", "resolution does not mutate stored data");

const page = readFileSync("src/components/content/ConsumptionRecordsPage.tsx", "utf8");
assert.doesNotMatch(page, /\.filter\(\(quarter\) => quarter <= currentQuarter\)/, "future quarters must not be capped");
assert.doesNotMatch(page, /!editablePeriodIds\.has\(month\) \|\|/, "Actual totals must not depend on editing permissions");
assert.doesNotMatch(page, /The file fiscal year does not match/, "filename must not restrict workbook periods to one FY");
assert.match(page, /sortConsumptionQuartersNewestFirst\(page.displayQuarterOrder\)/, "Records renders newest quarters first");
assert.match(page, /resolveConsumptionMonthDisplay\(/, "cell/header classification is independent from permissions");

void (async () => {
  for (const name of ["forecast_FY28.xlsx", "forecast_FY27_FY28.xlsx", "future.xlsx"]) {
    const file = { name, type: "", slice: () => new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])]) } as File;
    assert.equal(await validateForecastWorkbookFile(file), null, `${name}: periods are validated from workbook data on the backend`);
  }
})();
