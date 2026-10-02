import assert from "node:assert/strict";
import type { ConsumptionAnalysis, ConsumptionRecordsTotals } from "../src/data/consumptionApi";
import {
  buildHomeConsumptionLineEdges,
  buildHomeConsumptionOverview,
  type HomeConsumptionMonth
} from "../src/data/homeConsumptionOverview";

const analysis = {
  fiscalYear: "FY27",
  priorFiscalYear: "FY26",
  periodCoverage: {
    includedPeriods: ["FY27-JUN", "FY27-JUL", "FY27-AUG", "FY27-SEP"],
    actualPeriods: ["FY27-JUN", "FY27-JUL"],
    forecastPeriods: ["FY27-JUL", "FY27-AUG", "FY27-SEP"],
    priorComparisonPeriods: ["FY26-JUN", "FY26-JUL"],
    comparisonStatus: "COMPARABLE",
    comparisonUnavailableReason: null,
    incompletePeriods: ["FY27-SEP"]
  },
  portfolio: {
    actualAmountExact: "3000",
    forecastAmountExact: "7000",
    totalAmountExact: "10000",
    priorActualAmountExact: "2500"
  },
  quarters: [
    { quarter: "Q1", actualAmountExact: "3000", forecastAmountExact: "7000", totalAmountExact: "10000", coveragePercent: 100, status: "MIXED", qoqChangeAmountExact: null, qoqChangePercentExact: null }
  ],
  alerts: [
    { alertId: "1", serverPlanId: 1, account: "Acme", workload: "Database", workloadMapped: true, planId: "P1", periodKey: "FY27-JUL", type: "SPIKE", grade: "HIGH", actualAmountExact: "1900", baselineMedianExact: "1000", changeAmountExact: "900", changePercentExact: "90", reason: "Example" },
    { alertId: "2", serverPlanId: 2, account: "Acme", workload: "Compute", workloadMapped: true, planId: "P2", periodKey: "FY27-JUL", type: "DROP", grade: "WATCH", actualAmountExact: "500", baselineMedianExact: "800", changeAmountExact: "-300", changePercentExact: "-37.5", reason: "Example" }
  ]
} as unknown as ConsumptionAnalysis;

const totals: ConsumptionRecordsTotals = {
  actualByPeriod: { "FY27-JUN": "1000", "FY27-JUL": "2000", "FY27-AUG": "9999" },
  appliedForecastByPeriod: { "FY27-JUL": "9999", "FY27-AUG": "3000", "FY27-SEP": "4000" },
  outlookByPeriod: {},
  incompletePeriods: ["FY27-SEP"]
};

const overview = buildHomeConsumptionOverview(analysis, totals);
assert.equal(overview.actualAmountExact, "3000");
assert.equal(overview.expectedAmountExact, "10000");
assert.equal(overview.actualYoYPercentExact, "20.00");
assert.equal(overview.attentionSignalCount, 2);
assert.equal(overview.attentionAccountCount, 1);
assert.deepEqual(overview.months.map(({ periodKey, kind, amountExact }) => ({ periodKey, kind, amountExact })), [
  { periodKey: "FY27-JUN", kind: "ACTUAL", amountExact: "1000" },
  { periodKey: "FY27-JUL", kind: "ACTUAL", amountExact: "2000" },
  { periodKey: "FY27-AUG", kind: "FORECAST", amountExact: "3000" },
  { periodKey: "FY27-SEP", kind: "FORECAST", amountExact: "4000" }
]);
assert.equal(overview.months[3].incomplete, true);

const halfUpOverview = buildHomeConsumptionOverview({
  ...analysis,
  portfolio: { ...analysis.portfolio, actualAmountExact: "22469", priorActualAmountExact: "20000" }
} as ConsumptionAnalysis, totals);
assert.equal(halfUpOverview.actualYoYPercentExact, "12.35",
  "YoY percentage rounds HALF_UP to exactly two decimal percentage points");

const zeroDenominatorOverview = buildHomeConsumptionOverview({
  ...analysis,
  portfolio: { ...analysis.portfolio, priorActualAmountExact: "0" }
} as ConsumptionAnalysis, totals);
assert.equal(zeroDenominatorOverview.actualYoYPercentExact, null,
  "a zero prior-Actual denominator does not invent a percentage");
const missingDenominatorOverview = buildHomeConsumptionOverview({
  ...analysis,
  periodCoverage: { ...analysis.periodCoverage, comparisonStatus: "UNAVAILABLE", comparisonUnavailableReason: "Prior period missing." }
} as ConsumptionAnalysis, totals);
assert.equal(missingDenominatorOverview.actualYoYPercentExact, null,
  "a missing prior comparison does not invent a percentage");
assert.equal(missingDenominatorOverview.actualYoYUnavailableReason, "Prior period missing.");

const mtdAnalysis = {
  ...analysis,
  periodCoverage: {
    ...analysis.periodCoverage,
    includedPeriods: ["FY27-JUN", "FY27-JUL", "FY27-AUG", "FY27-SEP"],
    actualPeriods: ["FY27-JUN", "FY27-JUL", "FY27-AUG"],
    forecastPeriods: ["FY27-SEP"]
  }
} as ConsumptionAnalysis;
const mtdOverview = buildHomeConsumptionOverview(mtdAnalysis, {
  ...totals,
  mtdByPeriod: { "FY27-SEP": "1250" },
  mtdStatusByPeriod: { "FY27-SEP": "PROVISIONAL" }
}, "FY27-SEP");
assert.deepEqual(mtdOverview.months.map(({ periodKey, kind, amountExact, forecastAmountExact }) => ({ periodKey, kind, amountExact, forecastAmountExact })), [
  { periodKey: "FY27-JUN", kind: "ACTUAL", amountExact: "1000", forecastAmountExact: null },
  { periodKey: "FY27-JUL", kind: "ACTUAL", amountExact: "2000", forecastAmountExact: null },
  { periodKey: "FY27-AUG", kind: "ACTUAL", amountExact: "9999", forecastAmountExact: null },
  { periodKey: "FY27-SEP", kind: "MTD", amountExact: "1250", forecastAmountExact: "4000" }
]);
assert.equal(mtdOverview.forecastStartPeriod, "FY27-SEP",
  "Forecast starts in the month after the last completed Actual, regardless of MTD");
assert.equal(mtdOverview.months.find((month) => month.periodKey === "FY27-SEP")?.forecastAmountExact, "4000",
  "same-month graph Forecast must preserve the source Forecast without MTD replacement or subtraction");
assert.equal(mtdOverview.months.find((month) => month.periodKey === "FY27-SEP")?.amountExact, "1250",
  "same-month graph MTD remains an independent provisional value");
assert.deepEqual(mtdOverview.finalUploadRequiredPeriods, []);
assert.deepEqual(mtdOverview.actualPeriods, mtdAnalysis.periodCoverage.actualPeriods,
  "provisional MTD must not be classified as official Actual");

const pendingFinalOverview = buildHomeConsumptionOverview(mtdAnalysis, {
  ...totals,
  mtdByPeriod: { "FY27-SEP": "1250" },
  mtdStatusByPeriod: { "FY27-SEP": "FINAL_UPLOAD_REQUIRED" },
  mtdAsOfByPeriod: { "FY27-SEP": "2026-09-28" }
}, "FY27-SEP");
assert.equal(pendingFinalOverview.months.find((month) => month.periodKey === "FY27-SEP")?.kind, "MTD",
  "available MTD stays visible while the monthly final Actual upload is pending");
assert.equal(pendingFinalOverview.months.find((month) => month.periodKey === "FY27-SEP")?.amountExact, "1250");
assert.equal(pendingFinalOverview.mtdAsOf, "2026-09-28", "the MTD basis date is preserved");
assert.deepEqual(pendingFinalOverview.finalUploadRequiredPeriods, ["FY27-SEP"]);
assert.equal(pendingFinalOverview.actualAmountExact, analysis.portfolio.actualAmountExact,
  "final-only Actual aggregates remain unchanged by provisional MTD");

const missingMtdOverview = buildHomeConsumptionOverview(mtdAnalysis, {
  ...totals,
  mtdByPeriod: {},
  mtdStatusByPeriod: { "FY27-SEP": "FINAL_UPLOAD_REQUIRED" }
}, "FY27-SEP");
assert.equal(missingMtdOverview.months.some((month) => month.kind === "MTD"), false,
  "a status without a value must not fabricate a zero MTD point");
assert.deepEqual(missingMtdOverview.finalUploadRequiredPeriods, []);

const finalUploadedAnalysis = {
  ...mtdAnalysis,
  periodCoverage: {
    ...mtdAnalysis.periodCoverage,
    actualPeriods: [...mtdAnalysis.periodCoverage.actualPeriods, "FY27-SEP"],
    forecastPeriods: []
  }
} as ConsumptionAnalysis;
const finalUploadedOverview = buildHomeConsumptionOverview(finalUploadedAnalysis, {
  ...totals,
  actualByPeriod: { ...totals.actualByPeriod, "FY27-SEP": "1500" },
  mtdByPeriod: { "FY27-SEP": "1250" },
  mtdStatusByPeriod: { "FY27-SEP": "FINAL_UPLOAD_REQUIRED" },
  mtdAsOfByPeriod: { "FY27-SEP": "2026-09-28" }
}, "FY27-SEP");
assert.deepEqual(finalUploadedOverview.months.find((month) => month.periodKey === "FY27-SEP"), {
  periodKey: "FY27-SEP", kind: "ACTUAL", amountExact: "1500", amountChartCoordinate: 1500,
  forecastAmountExact: null, forecastAmountChartCoordinate: null, incomplete: true
}, "confirmed Actual takes precedence over an MTD value for the same period");
assert.equal(finalUploadedOverview.mtdAsOf, null);
assert.deepEqual(finalUploadedOverview.finalUploadRequiredPeriods, []);

const month = (
  periodKey: string,
  kind: HomeConsumptionMonth["kind"],
  amountExact: string | null,
  forecastAmountExact: string | null,
  incomplete: boolean
): HomeConsumptionMonth => ({
  periodKey,
  kind,
  amountExact,
  amountChartCoordinate: amountExact === null ? null : Number(amountExact),
  forecastAmountExact,
  forecastAmountChartCoordinate: forecastAmountExact === null ? null : Number(forecastAmountExact),
  incomplete
});
const lineMonths: readonly HomeConsumptionMonth[] = [
  month("FY27-JUN", "ACTUAL", "1000", null, false),
  month("FY27-JUL", "ACTUAL", "2000", null, false),
  month("FY27-AUG", "FORECAST", "3000", null, false),
  month("FY27-SEP", "FORECAST", null, null, true),
  month("FY27-OCT", "FORECAST", "5000", null, false),
  month("FY27-DEC", "FORECAST", "6000", null, false)
];
assert.deepEqual(buildHomeConsumptionLineEdges(lineMonths), [
  { kind: "ACTUAL", fromIndex: 0, toIndex: 1, fromAmountChartCoordinate: 1000, toAmountChartCoordinate: 2000 },
  { kind: "FORECAST", fromIndex: 1, toIndex: 2, fromAmountChartCoordinate: 2000, toAmountChartCoordinate: 3000 }
]);
assert.deepEqual(buildHomeConsumptionLineEdges([
  month("FY27-AUG", "ACTUAL", "2000", null, false),
  month("FY27-SEP", "MTD", "1250", "4000", true),
  month("FY27-OCT", "FORECAST", "5000", null, false)
]), [
  { kind: "FORECAST", fromIndex: 0, toIndex: 1, fromAmountChartCoordinate: 2000, toAmountChartCoordinate: 4000 },
  { kind: "FORECAST", fromIndex: 1, toIndex: 2, fromAmountChartCoordinate: 4000, toAmountChartCoordinate: 5000 }
]);

const exactBoundaryOverview = buildHomeConsumptionOverview({
  ...analysis,
  portfolio: { ...analysis.portfolio, actualAmountExact: "900719925474.0003", totalAmountExact: "900719925474.0004" }
} as ConsumptionAnalysis, {
  ...totals,
  actualByPeriod: { "FY27-JUN": "900719925474.0003", "FY27-JUL": "0.0001" }
});
assert.equal(exactBoundaryOverview.actualAmountExact, "900719925474.0003");
assert.deepEqual(exactBoundaryOverview.months.slice(0, 2).map((item) => item.amountExact),
  ["900719925474.0003", "0.0001"], "home aggregation keeps the unsafe-integer and minimum-scale values exact");

const manyAlertsAnalysis = {
  ...analysis,
  alerts: Array.from({ length: 12 }, (_, index) => ({
    ...analysis.alerts[index % analysis.alerts.length],
    alertId: String(index + 1)
  }))
} as ConsumptionAnalysis;
const overviewWithManyAlerts = buildHomeConsumptionOverview(manyAlertsAnalysis, totals);
assert.equal(overviewWithManyAlerts.attentionSignalCount, 12);
assert.equal(overviewWithManyAlerts.alerts.length, 10);
assert.deepEqual(overviewWithManyAlerts.alerts.map((alert) => alert.alertId), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

console.log("home consumption overview aggregation and line continuity: ok");
