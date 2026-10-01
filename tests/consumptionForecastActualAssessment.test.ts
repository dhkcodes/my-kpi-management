import assert from "node:assert/strict";
import {
  assessForecastActualMonth,
  countDistinctForecastActualAccounts,
  countForecastActualProblemAccounts,
  filterForecastActualProblemRows
} from "../src/data/forecastActualAssessment";
import type { ForecastActualMonth, ForecastActualRow } from "../src/data/consumptionApi";

const month = (overrides: Partial<ForecastActualMonth>): ForecastActualMonth => ({
  periodKey: "FY27-SEP",
  forecastAmount: "30",
  actualAmount: null,
  actualState: null,
  actualAsOf: null,
  differenceAmount: null,
  differencePercent: null,
  monthEndProjection: null,
  ...overrides
});
const row = (account: string, months: readonly ForecastActualMonth[]): ForecastActualRow => ({
  salesRep: "SE Kim",
  account,
  confirmedActualAmount: null,
  confirmedForecastAmount: "0",
  differenceAmount: null,
  differencePercent: null,
  fullPeriodForecastAmount: "0",
  projectedAmount: null,
  actualShortfall: null,
  attention: null,
  months
});

const finalShortfall = assessForecastActualMonth(month({ actualState: "FINAL", actualAmount: "70", forecastAmount: "100", differenceAmount: "999" }));
assert.deepEqual(
  { label: finalShortfall.label, differenceAmount: finalShortfall.differenceAmount, differenceLabel: finalShortfall.differenceLabel },
  { label: "미달", differenceAmount: "-30", differenceLabel: "Difference" },
  "final Difference is recomputed as Actual minus Forecast rather than trusting a mismatched response field"
);
assert.equal(assessForecastActualMonth(month({ actualState: "FINAL", actualAmount: "100", forecastAmount: "100" })).label, "정상");

const mtdShortfall = assessForecastActualMonth(month({ actualState: "MTD", actualAmount: "10", forecastAmount: "30", monthEndProjection: "20" }));
assert.deepEqual(
  { label: mtdShortfall.label, differenceAmount: mtdShortfall.differenceAmount, differenceLabel: mtdShortfall.differenceLabel },
  { label: "미달 예상", differenceAmount: "-10", differenceLabel: "월말 예상 Difference" },
  "MTD Difference uses month-end projection minus monthly Forecast"
);
assert.equal(assessForecastActualMonth(month({ actualState: "MTD", actualAmount: "10", forecastAmount: "30", monthEndProjection: null })).label, "비교 불가",
  "an MTD import timestamp alone cannot create a projection without a data-basis date");
assert.equal(assessForecastActualMonth(month({ forecastAmount: "30", actualAmount: null, actualState: null })).label, "미확정",
  "future Forecast months are not classified as shortfall");
assert.equal(assessForecastActualMonth(month({ forecastAmount: null, actualAmount: "10", actualState: "FINAL" })).label, "비교 불가",
  "missing Forecast stays missing instead of being coerced to zero");

const rows = [
  row("A", [month({ periodKey: "FY27-SEP", actualState: "FINAL", actualAmount: "10", forecastAmount: "20" }), month({ periodKey: "FY27-AUG", actualState: "FINAL", actualAmount: "5", forecastAmount: "10" })]),
  row("B", [month({ actualState: "MTD", actualAmount: "10", forecastAmount: "30", monthEndProjection: "20" })]),
  row("C", [month({ actualState: "FINAL", actualAmount: "40", forecastAmount: "30" })])
];
assert.deepEqual(countForecastActualProblemAccounts(rows), { finalShortfall: 1, mtdShortfall: 1 },
  "problem cards count distinct accounts even when an account misses in multiple months");
assert.deepEqual(filterForecastActualProblemRows(rows, "FINAL_SHORTFALL").map((value) => value.account), ["A"]);
assert.deepEqual(filterForecastActualProblemRows(rows, "MTD_SHORTFALL").map((value) => value.account), ["B"]);
assert.equal(filterForecastActualProblemRows(rows, null).length, 3, "clearing the card selection restores all filtered rows");

const duplicateAccountRows = [
  rows[0],
  { ...rows[0], salesRep: "SE Lee", months: [month({ periodKey: "FY27-AUG", actualState: "FINAL", actualAmount: "1", forecastAmount: "2" })] }
];
assert.equal(countForecastActualProblemAccounts(duplicateAccountRows, ["FY27-SEP"]).finalShortfall, 1,
  "problem cards count an Account once even when multiple Sales Rep rows match");
const duplicateFilteredRows = filterForecastActualProblemRows(duplicateAccountRows, "FINAL_SHORTFALL", ["FY27-SEP"]);
assert.equal(countDistinctForecastActualAccounts(duplicateFilteredRows), 1,
  "the Accounts result count uses the same distinct Account unit as the problem card");
assert.equal(duplicateFilteredRows.length, 1,
  "problem filtering evaluates only displayed quarter-scoped periods and ignores a hidden shortfall month");

console.log("forecast actual assessment tests passed");
