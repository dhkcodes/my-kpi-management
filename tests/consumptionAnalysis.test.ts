import assert from "node:assert/strict";
import { fetchConsumptionAnalysis } from "../src/data/consumptionApi";
import { ConsumptionAnalysisAccount, ConsumptionPlan, filterActiveConsumptionPlans, getAlertActualTrend, nextConsumptionBatchSize, resolveConsumptionControlTotal, shouldRestartConsumptionRecordsPage, sortAndFilterConsumptionAccounts } from "../src/data/consumptionData";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string; fetch: typeof fetch };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";

const analysis = {
  fiscalYear: "FY27",
  priorFiscalYear: "FY26",
  selectedAccount: null,
  portfolio: {
    actualAmount: 600, forecastAmount: 400, totalAmount: 1000, status: "MIXED", coveragePercent: 75,
    priorActualAmount: 900, priorForecastAmount: 0, priorTotalAmount: 900, priorStatus: "ACTUAL", priorCoveragePercent: 100
  },
  quarters: [
    { quarter: "Q1", actualAmount: 300, forecastAmount: 0, totalAmount: 300, status: "ACTUAL", coveragePercent: 100, qoqChangeAmount: null, qoqChangePercent: null },
    { quarter: "Q2", actualAmount: 300, forecastAmount: 100, totalAmount: 400, status: "MIXED", coveragePercent: 100, qoqChangeAmount: 100, qoqChangePercent: 33.3333 },
    { quarter: "Q3", actualAmount: 0, forecastAmount: 300, totalAmount: 300, status: "FORECAST", coveragePercent: 100, qoqChangeAmount: -100, qoqChangePercent: -25 },
    { quarter: "Q4", actualAmount: 0, forecastAmount: 0, totalAmount: 0, status: "INCOMPLETE", coveragePercent: 0, qoqChangeAmount: -300, qoqChangePercent: -100 }
  ],
  accountCandidates: [{ account: "Acme", workloads: ["Database"], planIds: ["P1"] }],
  contextActualTrend: [
    { periodKey: "FY26-MAR", actualAmount: 10, alertCalculationMonth: false },
    { periodKey: "FY26-APR", actualAmount: 20, alertCalculationMonth: false },
    { periodKey: "FY26-MAY", actualAmount: 30, alertCalculationMonth: true },
    { periodKey: "FY27-JUN", actualAmount: 40, alertCalculationMonth: true },
    { periodKey: "FY27-JUL", actualAmount: 50, alertCalculationMonth: true },
    { periodKey: "FY27-AUG", actualAmount: 60, alertCalculationMonth: true }
  ],
  otherContribution: {
    accountNames: ["Bravo", "Zulu"], actualAmount: 50, forecastAmount: 25, totalAmount: 75, status: "MIXED", percentage: 7.5,
    plans: [{ serverPlanId: 2, account: "Bravo", workload: "Compute", planId: "P2", endUser: "Bravo EU", dataCenter: "PHX",
      actualAmount: 50, forecastAmount: 25, totalAmount: 75, status: "MIXED", percentage: 100,
      actualTrend: [{ periodKey: "FY27-AUG", actualAmount: 50, alertCalculationMonth: true }] }]
  },
  alerts: [{
    alertId: "alert-1", serverPlanId: 1, account: "Acme", workload: "Database", planId: "P1", periodKey: "FY27-AUG",
    type: "ABOVE_USUAL", grade: "HIGH", actualAmount: 250, baselineMedian: 100, changeAmount: 150,
    changePercent: 150, reason: "Actual usage exceeded its recent baseline."
  }],
  accounts: [{
    account: "Acme", actualAmount: 600, forecastAmount: 400, totalAmount: 1000, status: "MIXED", percentage: 100,
    workloads: [{
      workload: "Database", actualAmount: 600, forecastAmount: 400, totalAmount: 1000, status: "MIXED", percentage: 100,
      plans: [{ serverPlanId: 1, planId: "P1", endUser: "Acme", dataCenter: "IAD", actualAmount: 600, forecastAmount: 400,
        totalAmount: 1000, status: "MIXED", percentage: 100,
        actualTrend: [
          { periodKey: "FY26-MAR", actualAmount: null, alertCalculationMonth: false },
          { periodKey: "FY26-APR", actualAmount: 20, alertCalculationMonth: false },
          { periodKey: "FY26-MAY", actualAmount: 30, alertCalculationMonth: true },
          { periodKey: "FY27-JUN", actualAmount: 40, alertCalculationMonth: true },
          { periodKey: "FY27-JUL", actualAmount: 50, alertCalculationMonth: true },
          { periodKey: "FY27-AUG", actualAmount: 60, alertCalculationMonth: true }
        ] }]
    }]
  }]
};

void (async () => {
  runtime.fetch = async (input, init) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/analysis?fiscalYear=FY27&search=&account=");
    assert.equal(init?.method, undefined);
    return new Response(JSON.stringify(analysis), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const decoded = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" });
  assert.equal(decoded.portfolio.status, "MIXED");
  assert.equal(decoded.portfolio.coveragePercent, 75);
  assert.equal(decoded.quarters[3].coveragePercent, 0);
  assert.deepEqual(decoded.quarters.map((quarter) => quarter.quarter), ["Q1", "Q2", "Q3", "Q4"]);
  assert.deepEqual(decoded.accountCandidates, analysis.accountCandidates);
  assert.equal(decoded.contextActualTrend.length, 6, "top-level current-context ACTUAL trend is decoded");
  assert.deepEqual(decoded.otherContribution?.accountNames, ["Bravo", "Zulu"]);
  assert.equal(decoded.otherContribution?.plans[0].account, "Bravo");
  assert.equal(decoded.otherContribution?.plans[0].workload, "Compute");
  assert.equal(decoded.accounts[0].workloads[0].plans[0].actualTrend.length, 6);
  assert.deepEqual(getAlertActualTrend(decoded.accounts[0].workloads[0].plans[0].actualTrend, "FY27-AUG").map((point) => point.periodKey),
    ["FY26-MAR", "FY26-APR", "FY26-MAY", "FY27-JUN", "FY27-JUL", "FY27-AUG"],
    "the selected alert base month anchors the preceding five ACTUAL months");

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/analysis?fiscalYear=FY27&search=%ED%95%9C%EA%B5%AD&account=Acme");
    return new Response(JSON.stringify({ ...analysis, selectedAccount: "Acme" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "한국", account: "Acme" });

  runtime.fetch = async () => new Response(JSON.stringify({ ...analysis, selectedAccount: "Acme",
    accounts: [{ ...analysis.accounts[0], account: "Wrong account" }] }),
    { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "Acme" }),
    /Malformed Consumption analysis/, "a successful response for another Account must fail closed");

  const legacyAnalysis = { ...analysis } as Partial<typeof analysis>;
  delete legacyAnalysis.accountCandidates;
  runtime.fetch = async () => new Response(JSON.stringify(legacyAnalysis), { status: 200, headers: { "Content-Type": "application/json" } });
  const legacyDecoded = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" });
  assert.deepEqual(legacyDecoded.accountCandidates, analysis.accountCandidates,
    "the strict typed client derives candidates from validated Accounts while the backend child rolls out the new field");

  const signedAnalysis = {
    ...analysis,
    portfolio: { ...analysis.portfolio, actualAmount: -100, forecastAmount: 50, totalAmount: -50 },
    alerts: [{ ...analysis.alerts[0], actualAmount: -20, baselineMedian: -5, changeAmount: -15 }],
    accounts: [{ ...analysis.accounts[0], actualAmount: -100, forecastAmount: 50, totalAmount: -50, percentage: 125,
      workloads: [{ ...analysis.accounts[0].workloads[0], actualAmount: -100, forecastAmount: 50, totalAmount: -50, percentage: -25,
        plans: [{ ...analysis.accounts[0].workloads[0].plans[0], actualAmount: -100, forecastAmount: 50, totalAmount: -50,
          percentage: 125, actualTrend: [{ periodKey: "FY27-JUN", actualAmount: -25, alertCalculationMonth: true }] }] }] }]
  };
  runtime.fetch = async () => new Response(JSON.stringify(signedAnalysis), { status: 200, headers: { "Content-Type": "application/json" } });
  const signedDecoded = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" });
  assert.equal(signedDecoded.portfolio.totalAmount, -50, "valid credits and negative adjustments remain analyzable");
  assert.equal(signedDecoded.accounts[0].percentage, 125, "signed portfolios may produce contribution percentages outside 0–100");

  for (const malformed of [
    { ...analysis, fiscalYear: "2027" },
    { ...analysis, portfolio: { ...analysis.portfolio, totalAmount: 999 } },
    { ...analysis, portfolio: { ...analysis.portfolio, coveragePercent: 101 } },
    { ...analysis, quarters: analysis.quarters.slice(0, 3) },
    { ...analysis, quarters: analysis.quarters.map((quarter, index) => index === 0 ? { ...quarter, status: "UNKNOWN" } : quarter) },
    { ...analysis, accounts: [{ ...analysis.accounts[0], percentage: "101" }] },
    { ...analysis, accounts: [analysis.accounts[0], { ...analysis.accounts[0], workloads: [] }] },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [analysis.accounts[0].workloads[0], { ...analysis.accounts[0].workloads[0], plans: [] }] }] },
    { ...analysis, alerts: [analysis.alerts[0], { ...analysis.alerts[0] }] },
    { ...analysis, otherContribution: { ...analysis.otherContribution, accountNames: ["Bravo", "Bravo"] } },
    { ...analysis, otherContribution: { ...analysis.otherContribution, accounts: analysis.otherContribution.accountNames, accountNames: undefined } },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [{ ...analysis.accounts[0].workloads[0], plans: [{ ...analysis.accounts[0].workloads[0].plans[0], serverPlanId: 9_007_199_254_740_992 }] }] }], alerts: [] },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [{ ...analysis.accounts[0].workloads[0], plans: [{ ...analysis.accounts[0].workloads[0].plans[0], actualTrend: [{ periodKey: "FY27-JUN", actualAmount: 1, alertCalculationMonth: true }, { periodKey: "FY27-JUN", actualAmount: 2, alertCalculationMonth: true }] }] }] }] },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [{ ...analysis.accounts[0].workloads[0], plans: [{ ...analysis.accounts[0].workloads[0].plans[0], actualTrend: [{ periodKey: "FY27-JUL", actualAmount: 1, alertCalculationMonth: true }, { periodKey: "FY27-JUN", actualAmount: 2, alertCalculationMonth: true }] }] }] }] },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [{ ...analysis.accounts[0].workloads[0], plans: [{ ...analysis.accounts[0].workloads[0].plans[0], actualTrend: [{ periodKey: "FY25-MAY", actualAmount: 1, alertCalculationMonth: true }] }] }] }] }
  ]) {
    runtime.fetch = async () => new Response(JSON.stringify(malformed), { status: 200, headers: { "Content-Type": "application/json" } });
    await assert.rejects(() => fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" }), /Malformed Consumption analysis/);
  }

  const accountRows = [
    { ...analysis.accounts[0], account: "Zulu", totalAmount: 100 },
    { ...analysis.accounts[0], account: "Alpha", totalAmount: 300 },
    { ...analysis.accounts[0], account: "Bravo", totalAmount: 200 }
  ] as unknown as ConsumptionAnalysisAccount[];
  assert.deepEqual(sortAndFilterConsumptionAccounts(accountRows, "a", "amount", "desc").map((row) => row.account), ["Alpha", "Bravo"]);
  assert.equal(nextConsumptionBatchSize(25, 10), 20);
  assert.equal(nextConsumptionBatchSize(25, 20), 25);
  assert.equal(nextConsumptionBatchSize(8, 10), 8);
  assert.equal(shouldRestartConsumptionRecordsPage(true, "\"v1\"", "\"v2\""), true, "append pages cannot cross ETag snapshots");
  assert.equal(shouldRestartConsumptionRecordsPage(true, "\"v1\"", "\"v1\""), false);
  assert.equal(shouldRestartConsumptionRecordsPage(false, "\"v1\"", "\"v2\""), false);

  const plan = (id: string, actuals: Record<string, number>, forecasts: Record<string, number>): ConsumptionPlan => ({
    id, customer: "Acme", endUser: id, planId: id, dataCenter: "IAD", planType: "OCI", actuals, forecasts
  });
  const dormant = plan("dormant", { "FY27-JUL": 0, "FY27-AUG": 0 }, { "FY27-SEP": 900 });
  const current = plan("current", { "FY27-AUG": 1 }, {});
  const previous = plan("previous", { "FY27-JUL": -1 }, {});
  assert.deepEqual(filterActiveConsumptionPlans([dormant, current, previous], "FY27-AUG").map((row) => row.id), ["current", "previous"],
    "Usage Records retain only plans with non-zero ACTUAL in the current or immediately previous fiscal month");

  assert.deepEqual(resolveConsumptionControlTotal([plan("a", {}, {}), plan("b", {}, {})], "FY27-SEP", undefined),
    { amount: null, detailState: "MISSING", editable: true, source: "MANUAL" });
  assert.deepEqual(resolveConsumptionControlTotal([plan("a", {}, { "FY27-SEP": 0 }), plan("b", {}, {})], "FY27-SEP", 0),
    { amount: 0, detailState: "ZERO", editable: true, source: "MANUAL" }, "explicit zero remains distinct from missing");
  assert.deepEqual(resolveConsumptionControlTotal([plan("a", {}, { "FY27-SEP": 25 }), plan("b", {}, { "FY27-SEP": 0 })], "FY27-SEP", 999),
    { amount: 25, detailState: "VALUE", editable: false, source: "DETAIL" }, "a non-zero child value immediately owns the Control Total");
  console.log("consumptionAnalysis tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
