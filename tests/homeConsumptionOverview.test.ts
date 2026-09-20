import assert from "node:assert/strict";
import type { ConsumptionAnalysis, ConsumptionRecordsTotals } from "../src/data/consumptionApi";
import { buildHomeConsumptionOverview } from "../src/data/homeConsumptionOverview";

const analysis = {
  fiscalYear: "FY27",
  priorFiscalYear: "FY26",
  periodCoverage: {
    includedPeriods: ["FY27-JUN", "FY27-JUL", "FY27-AUG", "FY27-SEP"],
    actualPeriods: ["FY27-JUN", "FY27-JUL"],
    forecastPeriods: ["FY27-JUL", "FY27-AUG", "FY27-SEP"],
    priorComparisonPeriods: ["FY26-JUN", "FY26-JUL"],
    comparisonStatus: "AVAILABLE",
    comparisonUnavailableReason: null,
    incompletePeriods: ["FY27-SEP"]
  },
  portfolio: { actualAmount: 3000, forecastAmount: 7000, totalAmount: 10000, priorActualAmount: 2500 },
  quarters: [
    { quarter: "Q1", actualAmount: 3000, forecastAmount: 7000, totalAmount: 10000, coveragePercent: 100, status: "MIXED", qoqChangeAmount: null, qoqChangePercent: null }
  ],
  alerts: [
    { alertId: "1", serverPlanId: 1, account: "Acme", workload: "Database", workloadMapped: true, planId: "P1", periodKey: "FY27-JUL", type: "SPIKE", grade: "HIGH", actualAmount: 1900, baselineMedian: 1000, changeAmount: 900, changePercent: 90, reason: "Example" },
    { alertId: "2", serverPlanId: 2, account: "Acme", workload: "Compute", workloadMapped: true, planId: "P2", periodKey: "FY27-JUL", type: "DROP", grade: "WATCH", actualAmount: 500, baselineMedian: 800, changeAmount: -300, changePercent: -37.5, reason: "Example" }
  ]
} as unknown as ConsumptionAnalysis;

const totals: ConsumptionRecordsTotals = {
  actualByPeriod: { "FY27-JUN": 1000, "FY27-JUL": 2000, "FY27-AUG": 9999 },
  appliedForecastByPeriod: { "FY27-JUL": 9999, "FY27-AUG": 3000, "FY27-SEP": 4000 },
  outlookByPeriod: {},
  incompletePeriods: ["FY27-SEP"]
};

const overview = buildHomeConsumptionOverview(analysis, totals);
assert.equal(overview.actualAmount, 3000);
assert.equal(overview.expectedAmount, 10000);
assert.equal(overview.actualYoYPercent, 20);
assert.equal(overview.attentionSignalCount, 2);
assert.equal(overview.attentionAccountCount, 1);
assert.deepEqual(overview.months.map(({ periodKey, kind, amount }) => ({ periodKey, kind, amount })), [
  { periodKey: "FY27-JUN", kind: "ACTUAL", amount: 1000 },
  { periodKey: "FY27-JUL", kind: "ACTUAL", amount: 2000 },
  { periodKey: "FY27-AUG", kind: "FORECAST", amount: 3000 },
  { periodKey: "FY27-SEP", kind: "FORECAST", amount: 4000 }
]);
assert.equal(overview.months[3].incomplete, true);
console.log("home consumption overview aggregation: ok");
