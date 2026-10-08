import assert from "node:assert/strict";
import {
  assessForecastActualMonth,
  assessForecastActualQuarter,
  countDistinctForecastActualAccounts,
  countForecastActualProblemAccounts,
  filterForecastActualProblemRows,
  summarizeForecastActualActuals,
  visibleForecastActualPeriods
} from "../src/data/forecastActualAssessment";
import type { ForecastActualMonth, ForecastActualRow } from "../src/data/consumptionApi";

const month = (overrides: Partial<ForecastActualMonth>): ForecastActualMonth => ({
  periodKey: "FY27-SEP",
  forecastAmount: "100",
  actualAmount: null,
  actualState: null,
  actualAsOf: null,
  differenceAmount: null,
  differencePercent: null,
  monthEndProjection: null,
  ...overrides
});

const row = (account: string, months: ForecastActualMonth[], salesRep = "Rep"): ForecastActualRow => ({
  salesRep,
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

const finalShortfall = assessForecastActualMonth(month({ actualState: "FINAL", actualAmount: "80" }));
assert.equal(finalShortfall.kind, "FINAL_SHORTFALL");
assert.equal(finalShortfall.label, "Confirmed Shortfall");
assert.equal(finalShortfall.differenceAmount, "-20");
assert.equal(finalShortfall.differenceLabel, "Difference");

const finalOnTrack = assessForecastActualMonth(month({ actualState: "FINAL", actualAmount: "100" }));
assert.equal(finalOnTrack.kind, "NORMAL");
assert.equal(finalOnTrack.label, "Matched");

const mtdShortfall = assessForecastActualMonth(month({
  actualState: "MTD",
  actualAmount: "10",
  actualAsOf: "2026-09-28T12:00:00Z",
  forecastAmount: "30"
}));
assert.equal(mtdShortfall.kind, "MTD_SHORTFALL");
assert.equal(mtdShortfall.label, "Projected Shortfall");
assert.equal(mtdShortfall.differenceAmount, "-20", "current Difference uses MTD Actual, not projected Actual");
assert.equal(mtdShortfall.differenceLabel, "Difference");
assert.equal(mtdShortfall.projectedAmount, "12", "Sep 28 minus 3 days gives effective day 25; 10 / 25 * 30 = 12");
assert.equal(mtdShortfall.projectedDifferenceAmount, "-18");
assert.match(mtdShortfall.tooltip, /through 2026-09-25/u);
assert.match(mtdShortfall.tooltip, /month-end 12/u);

const recurringProjectionNearThreshold = assessForecastActualMonth(month({
  periodKey: "FY27-OCT",
  actualState: "MTD",
  actualAmount: "1",
  actualAsOf: "2026-10-06",
  forecastAmount: "10.3333332"
}));
assert.equal(recurringProjectionNearThreshold.projectedAmount, "10.333333");
assert.equal(recurringProjectionNearThreshold.projectedDifferenceAmount, "0",
  "the exact positive difference may round to zero for display but must never change sign");
assert.equal(recurringProjectionNearThreshold.kind, "NORMAL",
  "31 / 3 is exactly above 10.3333332; display rounding must not classify it as a shortfall");
assert.equal(recurringProjectionNearThreshold.label, "Projected On Track");

const mtdZero = assessForecastActualMonth(month({
  actualState: "MTD",
  actualAmount: "0",
  actualAsOf: "2026-09-28",
  forecastAmount: "30"
}));
assert.equal(mtdZero.projectedAmount, "0", "zero MTD is a real value, not missing");
assert.equal(mtdZero.kind, "MTD_SHORTFALL");

assert.equal(assessForecastActualMonth(month({ actualState: "MTD", actualAmount: null, actualAsOf: "2026-09-28" })).label, "N/A");
assert.equal(assessForecastActualMonth(month({ actualState: "MTD", actualAmount: "10", actualAsOf: null })).label, "N/A");
assert.equal(assessForecastActualMonth(month({ actualState: "MTD", actualAmount: "10", actualAsOf: "2026-09-02" })).label, "N/A",
  "an adjusted date outside the target month is not extrapolated across a month boundary");
assert.equal(assessForecastActualMonth(month({ forecastAmount: null, actualState: "FINAL", actualAmount: "80" })).label, "N/A");

const rows = [
  row("A", [month({ actualState: "FINAL", actualAmount: "80" }), month({ periodKey: "FY27-OCT", actualState: "FINAL", actualAmount: "70" })]),
  row("B", [month({ actualState: "MTD", actualAmount: "10", actualAsOf: "2026-09-28", forecastAmount: "30" })]),
  row("A", [month({ actualState: "FINAL", actualAmount: "120" })], "Other Rep"),
  row("C", [month({ actualState: "FINAL", actualAmount: "100" })])
];
assert.deepEqual(countForecastActualProblemAccounts(rows, ["FY27-SEP", "FY27-OCT"]), { finalShortfall: 1, mtdShortfall: 1 },
  "problem cards count distinct accounts, even when an account spans rows or months");
assert.deepEqual(filterForecastActualProblemRows(rows, "FINAL_SHORTFALL", ["FY27-SEP", "FY27-OCT"]).map((item) => item.account), ["A"]);
assert.deepEqual(filterForecastActualProblemRows(rows, "MTD_SHORTFALL", ["FY27-SEP"]).map((item) => item.account), ["B"]);
assert.equal(countDistinctForecastActualAccounts(rows), 3);

const periodRows = [row("A", [
  month({ periodKey: "FY27-JUN", actualAmount: "100", actualState: "FINAL" }),
  month({ periodKey: "FY27-JUL", actualAmount: "120", actualState: "FINAL" }),
  month({ periodKey: "FY27-AUG", actualAmount: "140", actualState: "FINAL" }),
  month({ periodKey: "FY27-SEP", forecastAmount: "100" }),
  month({ periodKey: "FY27-OCT", forecastAmount: "0" }),
  month({ periodKey: "FY27-NOV", forecastAmount: "200" }),
  month({ periodKey: "FY27-DEC", forecastAmount: null })
])];
assert.deepEqual(
  visibleForecastActualPeriods(["FY27-MAY", "FY27-DEC", "FY27-NOV", "FY27-OCT", "FY27-SEP", "FY27-AUG"], periodRows),
  ["FY27-MAY", "FY27-DEC", "FY27-NOV", "FY27-OCT", "FY27-SEP", "FY27-AUG", "FY27-JUL", "FY27-JUN"],
  "The complete server fiscal calendar remains visible; value-only row periods are merged and entered zero is retained"
);
assert.deepEqual(
  visibleForecastActualPeriods([], [row("Actual only", [
    month({ periodKey: "FY27-JUN", actualAmount: "100", actualState: "FINAL" }),
    month({ periodKey: "FY27-JUL", actualAmount: "0", actualState: "FINAL" }),
    month({ periodKey: "FY27-AUG", forecastAmount: null, actualAmount: null, actualState: null })
  ])]),
  ["FY27-JUL", "FY27-JUN"],
  "Q1 remains visible without Forecast, explicit zero stays distinct from missing Actual"
);

const totals = summarizeForecastActualActuals([
  row("A", [
    month({ periodKey: "FY27-SEP", actualState: "FINAL", actualAmount: "100.25" }),
    month({ periodKey: "FY27-OCT", actualState: "MTD", actualAmount: "20.75" }),
    month({ periodKey: "FY27-NOV", actualState: null, actualAmount: null })
  ]),
  row("B", [month({ periodKey: "FY27-SEP", actualState: "FINAL", actualAmount: "30" })])
], ["FY27-SEP", "FY27-OCT", "FY27-NOV"]);
assert.deepEqual(totals, { totalAmount: "151", confirmedAmount: "130.25", mtdAmount: "20.75", includesMtd: true, hasActual: true });
assert.deepEqual(summarizeForecastActualActuals([row("A", [month({ actualAmount: null })])], ["FY27-SEP"]),
  { totalAmount: null, confirmedAmount: null, mtdAmount: null, includesMtd: false, hasActual: false },
  "missing Actual remains missing and is not converted to zero");

const q2Progressing = row("Quarter A", [
  month({ periodKey: "FY27-SEP", forecastAmount: "50", actualAmount: "50", actualState: "FINAL" }),
  month({ periodKey: "FY27-OCT", forecastAmount: "50", actualAmount: null, actualState: null }),
  month({ periodKey: "FY27-NOV", forecastAmount: "100", actualAmount: null, actualState: null })
]);
assert.deepEqual(assessForecastActualQuarter(q2Progressing, "Q2", new Date("2026-10-15T00:00:00Z"), "FINAL"), {
  quarter: "Q2", status: "SHORTFALL", forecastAmount: "200", actualAmount: "50",
  differenceAmount: "150", relevantAmount: "150"
}, "a progressing quarter compares cumulative FINAL Actual with the complete stored quarter Forecast");
assert.deepEqual(
  assessForecastActualQuarter(q2Progressing, "Q2", new Date("2026-10-15T00:00:00Z"), "MTD"),
  { quarter: "Q2", status: "SHORTFALL", forecastAmount: "200", actualAmount: "50", differenceAmount: "150", relevantAmount: "150" },
  "MTD ON preserves the FINAL-only Gap when the Account has no valid current-month MTD row"
);
const q2WithMtd = row("Quarter B", [
  month({ periodKey: "FY27-SEP", forecastAmount: "50", actualAmount: "50", actualState: "FINAL" }),
  month({ periodKey: "FY27-OCT", forecastAmount: "50", actualAmount: "100", actualState: "MTD", actualAsOf: "2026-10-15" }),
  month({ periodKey: "FY27-NOV", forecastAmount: "100", actualAmount: null, actualState: null })
]);
assert.equal(assessForecastActualQuarter(q2WithMtd, "Q2", new Date("2026-10-15T00:00:00Z"), "MTD").relevantAmount, "50");
const explicitZeroQuarter = row("Zero", [
  month({ periodKey: "FY27-SEP", forecastAmount: "0", actualAmount: "0", actualState: "FINAL" }),
  month({ periodKey: "FY27-OCT", forecastAmount: "0", actualAmount: "0", actualState: "MTD", actualAsOf: "2026-10-15" }),
  month({ periodKey: "FY27-NOV", forecastAmount: "0", actualAmount: null, actualState: null })
]);
assert.equal(assessForecastActualQuarter(explicitZeroQuarter, "Q2", new Date("2026-10-15T00:00:00Z"), "MTD").status, "MATCHED",
  "an explicit zero Forecast and zero Actual are comparable and exactly matched");
assert.deepEqual(
  assessForecastActualQuarter(row("No forecast", [month({ forecastAmount: null, actualAmount: "1", actualState: "FINAL" })]), "Q2"),
  { quarter: "Q2", status: "NO_FORECAST", forecastAmount: null, actualAmount: "1", differenceAmount: null, relevantAmount: null },
  "a missing Forecast prevents comparison but must not hide an existing Actual"
);
assert.equal(assessForecastActualQuarter(row("Future", [
  month({ periodKey: "FY27-DEC", forecastAmount: "10" }), month({ periodKey: "FY27-JAN", forecastAmount: "10" }), month({ periodKey: "FY27-FEB", forecastAmount: "10" })
]), "Q3", new Date("2026-10-15T00:00:00Z")).status, "FUTURE");
assert.equal(assessForecastActualQuarter(row("Future without forecast", [
  month({ periodKey: "FY27-SEP", forecastAmount: "10", actualAmount: "10", actualState: "FINAL" })
]), "Q3", new Date("2026-10-15T00:00:00Z")).status, "FUTURE");
const invalidMtdResult = assessForecastActualQuarter(row("Invalid MTD", [
  month({ periodKey: "FY27-SEP", forecastAmount: "50", actualAmount: "50", actualState: "FINAL" }),
  month({ periodKey: "FY27-OCT", forecastAmount: "50", actualAmount: "999", actualState: "MTD", actualAsOf: "2026-09-30T00:00:00Z" }),
  month({ periodKey: "FY27-NOV", forecastAmount: "100" })
]), "Q2", new Date("2026-10-15T00:00:00Z"), "MTD");
assert.equal(invalidMtdResult.actualAmount, "50", "invalid or out-of-period MTD is excluded from quarter Actual");
assert.equal(invalidMtdResult.differenceAmount, "150");
assert.equal(
  assessForecastActualQuarter(q2WithMtd, "Q2", new Date("2026-10-15T00:00:00Z"), "FINAL").actualAmount,
  "50",
  "FINAL mode excludes an otherwise valid MTD value"
);
assert.equal(assessForecastActualQuarter(row("Closed partial", [
  month({ periodKey: "FY27-JUN", forecastAmount: "10", actualAmount: "10", actualState: "FINAL" }),
  month({ periodKey: "FY27-JUL", forecastAmount: "10", actualAmount: null, actualState: null }),
  month({ periodKey: "FY27-AUG", forecastAmount: "10", actualAmount: "10", actualState: "FINAL" })
]), "Q1", new Date("2026-10-15T00:00:00Z")).status, "PARTIAL_ACTUAL");
assert.equal(assessForecastActualQuarter(row("Closed omitted month", [
  month({ periodKey: "FY27-JUN", forecastAmount: "10", actualAmount: "10", actualState: "FINAL" }),
  month({ periodKey: "FY27-AUG", forecastAmount: "10", actualAmount: "10", actualState: "FINAL" })
]), "Q1", new Date("2026-10-15T00:00:00Z")).status, "PARTIAL_ACTUAL",
"an entirely omitted elapsed month cannot make a closed quarter comparable");

const repeatedAccountResult = assessForecastActualQuarter([
  row("Shared", [month({ periodKey: "FY27-SEP", forecastAmount: "100", actualAmount: "80", actualState: "FINAL" })], "Rep A"),
  row("Shared", [month({ periodKey: "FY27-SEP", forecastAmount: "50", actualAmount: "70", actualState: "FINAL" })], "Rep B")
], "Q2", new Date("2026-10-15T00:00:00Z"));
assert.deepEqual(repeatedAccountResult, {
  quarter: "Q2", status: "MATCHED", forecastAmount: "150", actualAmount: "150",
  differenceAmount: "0", relevantAmount: "0"
}, "rows sharing an Account are combined before classification so cards never double-count that Account");

console.log("Forecast vs Actual assessment tests passed.");
