import assert from "node:assert/strict";
import { compareForecastActualRows, forecastActualPeriodsLatestFirst } from "../src/data/forecastActualSort";
import type { ForecastActualRow } from "../src/data/consumptionApi";

const row = (overrides: Partial<ForecastActualRow>): ForecastActualRow => ({
  salesRep: "Rep",
  account: "Account",
  confirmedActualAmount: null,
  confirmedForecastAmount: "0",
  differenceAmount: null,
  differencePercent: null,
  fullPeriodForecastAmount: "0",
  projectedAmount: null,
  actualShortfall: null,
  attention: null,
  months: [],
  ...overrides
});

const low = row({
  account: "Low",
  confirmedActualAmount: "0",
  confirmedForecastAmount: "2",
  fullPeriodForecastAmount: "10",
  projectedAmount: "100",
  actualShortfall: true,
  attention: false,
  months: [{ periodKey: "FY27-OCT", forecastAmount: "20", actualAmount: "0", actualState: "FINAL", actualAsOf: null, differenceAmount: "-20", differencePercent: "-100", monthEndProjection: null }]
});
const high = row({
  account: "High",
  confirmedActualAmount: "9",
  confirmedForecastAmount: "20",
  fullPeriodForecastAmount: "200",
  projectedAmount: "900",
  actualShortfall: false,
  attention: true,
  months: [{ periodKey: "FY27-OCT", forecastAmount: "200", actualAmount: "9", actualState: "FINAL", actualAsOf: null, differenceAmount: "-191", differencePercent: "-95.5", monthEndProjection: null }]
});
const unavailable = row({ account: "Unavailable" });

for (const key of ["forecast", "actual", "projected", "month:FY27-OCT"] as const) {
  assert.ok(compareForecastActualRows(low, high, key, "asc") < 0, `${key} must sort numerically ascending`);
  assert.ok(compareForecastActualRows(low, high, key, "desc") > 0, `${key} must sort numerically descending`);
}
for (const key of ["actual", "projected", "month:FY27-OCT"] as const) {
  assert.ok(compareForecastActualRows(unavailable, low, key, "asc") > 0, `${key} unavailable values stay last ascending`);
  assert.ok(compareForecastActualRows(unavailable, low, key, "desc") > 0, `${key} unavailable values stay last descending`);
}

assert.ok(compareForecastActualRows(low, high, "status", "asc") > 0,
  "status sorting must include finalized Actual shortfall before projected watch");

const periodRows = [
  row({ months: [
    { periodKey: "FY27-JUL", forecastAmount: "1", actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null },
    { periodKey: "FY27-JUN", forecastAmount: "1", actualAmount: "1", actualState: "FINAL", actualAsOf: null, differenceAmount: "0", differencePercent: "0", monthEndProjection: null }
  ] }),
  row({ months: [
    { periodKey: "FY27-JAN", forecastAmount: "2", actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null },
    { periodKey: "FY27-DEC", forecastAmount: "2", actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null },
    { periodKey: "FY27-MAY", forecastAmount: "0", actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null }
  ] })
];
assert.deepEqual(forecastActualPeriodsLatestFirst(periodRows), ["FY27-JAN", "FY27-DEC", "FY27-JUL", "FY27-JUN"],
  "actual fiscal chronology must put the latest data-bearing month on the left, including the FY year rollover, without empty future months");

console.log("consumptionForecastActualSort.test.ts: all assertions passed");
