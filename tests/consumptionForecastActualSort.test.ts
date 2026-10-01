import assert from "node:assert/strict";
import { compareForecastActualRows, forecastActualPeriodsLatestFirst } from "../src/data/forecastActualSort";
import type { ForecastActualRow } from "../src/data/consumptionApi";
import { formatMtdAppliedDate } from "../src/data/mtdDate";

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
  months: [{ periodKey: "FY27-OCT", forecastAmount: "200", actualAmount: "209", actualState: "FINAL", actualAsOf: null, differenceAmount: "9", differencePercent: "4.5", monthEndProjection: null }]
});
const unavailable = row({ account: "Unavailable" });

for (const key of ["forecast", "actual", "projected", "month:FY27-OCT", "actual:FY27-OCT", "difference:FY27-OCT"] as const) {
  assert.ok(compareForecastActualRows(low, high, key, "asc") < 0, `${key} must sort numerically ascending`);
  assert.ok(compareForecastActualRows(low, high, key, "desc") > 0, `${key} must sort numerically descending`);
}
for (const key of ["actual", "projected", "month:FY27-OCT", "actual:FY27-OCT", "difference:FY27-OCT"] as const) {
  assert.ok(compareForecastActualRows(unavailable, low, key, "asc") > 0, `${key} unavailable values stay last ascending`);
  assert.ok(compareForecastActualRows(unavailable, low, key, "desc") > 0, `${key} unavailable values stay last descending`);
}

assert.ok(compareForecastActualRows(low, high, "status", "asc") > 0,
  "status sorting must include finalized Actual shortfall before projected watch");
assert.ok(compareForecastActualRows(low, high, "status:FY27-OCT", "asc") < 0,
  "month status sorting must use the rendered month assessment instead of text");

const lowForecastHighActual = row({
  account: "Low forecast",
  months: [{ periodKey: "FY27-OCT", forecastAmount: "1", actualAmount: "999", actualState: "FINAL", actualAsOf: null, differenceAmount: "998", differencePercent: "99800", monthEndProjection: null }]
});
const highForecastLowActual = row({
  account: "High forecast",
  months: [{ periodKey: "FY27-OCT", forecastAmount: "2", actualAmount: "0", actualState: "FINAL", actualAsOf: null, differenceAmount: "-2", differencePercent: "-100", monthEndProjection: null }]
});
assert.ok(compareForecastActualRows(lowForecastHighActual, highForecastLowActual, "month:FY27-OCT", "asc") < 0,
  "month Forecast header must sort by Forecast, not Actual");

const periodRows = [
  row({ months: [
    { periodKey: "FY27-JUL", forecastAmount: "1", actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null },
    { periodKey: "FY27-JUN", forecastAmount: "1", actualAmount: "1", actualState: "FINAL", actualAsOf: null, differenceAmount: "0", differencePercent: "0", monthEndProjection: null }
  ] }),
  row({ months: [
    { periodKey: "FY27-JAN", forecastAmount: "2", actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null },
    { periodKey: "FY27-DEC", forecastAmount: "2", actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null },
    { periodKey: "FY27-MAY", forecastAmount: "0", actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null },
    { periodKey: "FY27-APR", forecastAmount: null, actualAmount: "8", actualState: "FINAL", actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: null },
    { periodKey: "FY27-MAR", forecastAmount: null, actualAmount: null, actualState: null, actualAsOf: null, differenceAmount: null, differencePercent: null, monthEndProjection: "9" }
  ] })
];
assert.deepEqual(
  forecastActualPeriodsLatestFirst(["FY27-JUN", "FY27-JUL", "FY27-MAY", "FY27-APR", "FY27-MAR"]),
  ["FY27-MAY", "FY27-APR", "FY27-MAR", "FY27-JUL", "FY27-JUN"],
  "authoritative quarter-scoped fullForecastPeriods must remain visible and sort latest first even when rows omit a month"
);

assert.equal(formatMtdAppliedDate(null), null);
assert.equal(formatMtdAppliedDate("not-a-date"), null);
assert.equal(formatMtdAppliedDate("2026-09-28T03:16:25.664401Z"), "2026-09-28");
assert.equal(formatMtdAppliedDate("2026-09-28T23:30:00-02:00"), "2026-09-29",
  "MTD date must use the UTC ISO date part");

console.log("consumptionForecastActualSort.test.ts: all assertions passed");
