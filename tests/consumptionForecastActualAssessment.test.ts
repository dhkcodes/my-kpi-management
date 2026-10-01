import assert from "node:assert/strict";
import {
  assessForecastActualMonth,
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
assert.equal(finalShortfall.label, "확정 미달");
assert.equal(finalShortfall.differenceAmount, "-20");
assert.equal(finalShortfall.differenceLabel, "확정 Actual − Forecast");

const finalOnTrack = assessForecastActualMonth(month({ actualState: "FINAL", actualAmount: "100" }));
assert.equal(finalOnTrack.kind, "NORMAL");
assert.equal(finalOnTrack.label, "확정 정상");

const mtdShortfall = assessForecastActualMonth(month({
  actualState: "MTD",
  actualAmount: "10",
  actualAsOf: "2026-09-28T12:00:00Z",
  forecastAmount: "30"
}));
assert.equal(mtdShortfall.kind, "MTD_SHORTFALL");
assert.equal(mtdShortfall.label, "예상 미달");
assert.equal(mtdShortfall.differenceAmount, "-20", "current Difference uses MTD Actual, not projected Actual");
assert.equal(mtdShortfall.differenceLabel, "현재 MTD − Forecast");
assert.equal(mtdShortfall.projectedAmount, "12", "Sep 28 minus 3 days gives effective day 25; 10 / 25 * 30 = 12");
assert.equal(mtdShortfall.projectedDifferenceAmount, "-18");
assert.match(mtdShortfall.tooltip, /유효 누적 기준일 2026-09-25/u);
assert.match(mtdShortfall.tooltip, /남은 5일/u);

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
assert.equal(recurringProjectionNearThreshold.label, "예상 정상");

const mtdZero = assessForecastActualMonth(month({
  actualState: "MTD",
  actualAmount: "0",
  actualAsOf: "2026-09-28",
  forecastAmount: "30"
}));
assert.equal(mtdZero.projectedAmount, "0", "zero MTD is a real value, not missing");
assert.equal(mtdZero.kind, "MTD_SHORTFALL");

assert.equal(assessForecastActualMonth(month({ actualState: "MTD", actualAmount: null, actualAsOf: "2026-09-28" })).label, "비교 불가");
assert.equal(assessForecastActualMonth(month({ actualState: "MTD", actualAmount: "10", actualAsOf: null })).label, "비교 불가");
assert.equal(assessForecastActualMonth(month({ actualState: "MTD", actualAmount: "10", actualAsOf: "2026-09-02" })).label, "비교 불가",
  "an adjusted date outside the target month is not extrapolated across a month boundary");
assert.equal(assessForecastActualMonth(month({ forecastAmount: null, actualState: "FINAL", actualAmount: "80" })).label, "비교 불가");

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
  ["FY27-NOV", "FY27-OCT", "FY27-SEP", "FY27-AUG", "FY27-JUL", "FY27-JUN"],
  "Forecast and Actual-only months are both visible; entered zero is retained and null-only months are excluded"
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

console.log("Forecast vs Actual assessment tests passed.");
