import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchConsumptionAnalysis } from "../src/data/consumptionApi";
import { ConsumptionPlan, filterForecastCompositionAccounts, getAlertActualTrend, isUnmappedConsumptionLabel, nextConsumptionBatchSize, resolveConsumptionControlTotal, shouldRefreshConsumptionAnalysisContext, shouldRestartConsumptionRecordsPage, sortAndFilterConsumptionAccounts } from "../src/data/consumptionData";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string; fetch: typeof fetch };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";
const deployedNonComparableAnalysis = JSON.parse(readFileSync(
  "tests/fixtures/deployed-analysis-noncomparable.json",
  "utf8"
));

const analysis = {
  selectedPillar: "ALL",
  fiscalYear: "FY27",
  priorFiscalYear: "FY26",
  selectedAccount: null,
  selectedSalesRep: null,
  salesRepOptions: ["Rep A", "Unassigned"],
  periodCoverage: {
    actualPeriods: ["FY27-JUN", "FY27-JUL", "FY27-AUG"],
    forecastPeriods: ["FY27-SEP"],
    includedPeriods: ["FY27-JUN", "FY27-JUL", "FY27-AUG", "FY27-SEP"],
    priorComparisonPeriods: ["FY26-JUN", "FY26-JUL", "FY26-AUG"],
    comparisonStatus: "AVAILABLE",
    comparisonUnavailableReason: null
  },
  salesRepOverview: [{ salesRep: "Rep A", actualAmount: 600, priorActualAmount: 500, actualGrowthAmount: 100,
    actualGrowthPercent: 20, yoyComparisonStatus: "AVAILABLE", yoyUnavailableReason: null,
    forecastAmount: 400, fyExpectedAmount: 1000, accountCount: 1,
    topThreeConcentrationPercent: 100, attentionAccountCount: 1 }],
  portfolio: {
    actualAmount: 600, forecastAmount: 400, totalAmount: 1000, forecastOverlapAmount: 0, status: "MIXED", coveragePercent: 75,
    priorActualAmount: 900, priorForecastAmount: 0, priorTotalAmount: 900, priorStatus: "ACTUAL", priorCoveragePercent: 100
  },
  quarters: [
    { quarter: "Q1", actualAmount: 300, forecastAmount: 0, totalAmount: 300, forecastOverlapAmount: 0, status: "ACTUAL", coveragePercent: 100, qoqChangeAmount: null, qoqChangePercent: null },
    { quarter: "Q2", actualAmount: 300, forecastAmount: 100, totalAmount: 400, forecastOverlapAmount: 0, status: "MIXED", coveragePercent: 100, qoqChangeAmount: 100, qoqChangePercent: 33.3333 },
    { quarter: "Q3", actualAmount: 0, forecastAmount: 300, totalAmount: 300, forecastOverlapAmount: 0, status: "FORECAST", coveragePercent: 100, qoqChangeAmount: -100, qoqChangePercent: -25 },
    { quarter: "Q4", actualAmount: 0, forecastAmount: 0, totalAmount: 0, forecastOverlapAmount: 0, status: "INCOMPLETE", coveragePercent: 0, qoqChangeAmount: -300, qoqChangePercent: -100 }
  ],
  movementBridge: [
    { quarter: "Q1", totalForecastAmount: 100, newAmount: 25, expansionAmount: 15, reductionAmount: 10, netMovementAmount: 30,
      compositionStatus: "CLASSIFIED", classifiedAccountCount: 2, unclassifiedAccountCount: 0, unavailableReason: null },
    { quarter: "Q2", totalForecastAmount: 75, newAmount: null, expansionAmount: null, reductionAmount: null, netMovementAmount: null,
      compositionStatus: "UNAVAILABLE", classifiedAccountCount: 0, unclassifiedAccountCount: 1,
      unavailableReason: "Movement composition is unavailable for legacy scalar forecasts." }
  ],
  accountCandidates: [{ account: "Acme", salesRep: "Rep A", workloads: ["Database"], planIds: ["P1"] }],
  contextActualTrend: [
    { periodKey: "FY26-MAR", actualAmount: 10, alertCalculationMonth: false },
    { periodKey: "FY26-APR", actualAmount: 20, alertCalculationMonth: false },
    { periodKey: "FY26-MAY", actualAmount: 30, alertCalculationMonth: true },
    { periodKey: "FY27-JUN", actualAmount: 40, alertCalculationMonth: true },
    { periodKey: "FY27-JUL", actualAmount: 50, alertCalculationMonth: true },
    { periodKey: "FY27-AUG", actualAmount: 60, alertCalculationMonth: true }
  ],
  alerts: [{
    alertId: "alert-1", serverPlanId: 1, account: "Acme", workload: "Database", workloadMapped: true, planId: "P1", periodKey: "FY27-AUG",
    type: "ABOVE_USUAL", grade: "HIGH", actualAmount: 250, baselineMedian: 100, changeAmount: 150,
    changePercent: 150, reason: "Actual usage exceeded its recent baseline."
  }],
  accounts: [{
    account: "Acme", salesRep: "Rep A", actualAmount: 600, forecastAmount: 400, totalAmount: 600, status: "MIXED", percentage: 100,
    actualEntryStatus: "PROVIDED", priorActualAmount: 500, actualGrowthAmount: 100, actualGrowthPercent: 20,
    forecastEntryStatus: "ENTERED", attentionReasons: ["Recent actual above usual"],
    workloads: [{
      workload: "Database", actualAmount: 600, forecastAmount: 400, totalAmount: 600, status: "MIXED", percentage: 100,
      plans: [{ serverPlanId: 1, planId: "P1", endUser: "Acme", dataCenter: "IAD", actualAmount: 600, forecastAmount: 400,
        totalAmount: 600, status: "MIXED", percentage: 100, actualEntryStatus: "PROVIDED",
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
  assert.equal(isUnmappedConsumptionLabel("Unmapped"), true, "the production fallback label is hidden");
  assert.equal(isUnmappedConsumptionLabel("  uNmApPeD  "), true, "unmapped matching ignores case and surrounding whitespace");
  assert.equal(isUnmappedConsumptionLabel("Database"), false, "actual workload names remain visible");

  runtime.fetch = async (input, init) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/analysis?fiscalYear=FY27&search=&account=&salesRep=");
    assert.equal(init?.method, undefined);
    return new Response(JSON.stringify(analysis), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const decoded = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" });
  assert.equal(decoded.portfolio.status, "MIXED");
  assert.equal(decoded.portfolio.coveragePercent, 75);
  assert.equal(decoded.quarters[3].coveragePercent, 0);
  assert.deepEqual(decoded.quarters.map((quarter) => quarter.quarter), ["Q1", "Q2", "Q3", "Q4"]);
  assert.deepEqual(decoded.movementBridge, analysis.movementBridge.map((point) => ({
    quarter: point.quarter,
    totalForecastAmountExact: String(point.totalForecastAmount),
    newAmountExact: point.newAmount === null ? null : String(point.newAmount),
    expansionAmountExact: point.expansionAmount === null ? null : String(point.expansionAmount),
    reductionAmountExact: point.reductionAmount === null ? null : String(point.reductionAmount),
    netMovementAmountExact: point.netMovementAmount === null ? null : String(point.netMovementAmount),
    compositionStatus: point.compositionStatus,
    unavailableReason: point.unavailableReason,
    classifiedAccountCount: point.classifiedAccountCount,
    unclassifiedAccountCount: point.unclassifiedAccountCount,
    includedForecastPeriods: [],
    accounts: []
  })), "legacy movement responses gain exact drill fields without turning unavailable coverage into zero");
  assert.deepEqual(decoded.accountCandidates, analysis.accountCandidates);
  assert.equal(decoded.salesRepOverview[0].fyExpectedAmountExact, "1000");
  assert.deepEqual(decoded.periodCoverage, analysis.periodCoverage);
  assert.equal(decoded.salesRepOverview[0].yoyComparisonStatus, "AVAILABLE");
  assert.equal(decoded.accounts[0].forecastEntryStatus, "ENTERED");
  assert.equal(decoded.accounts[0].totalAmountExact, "600",
    "Actual-only Account contribution accepts the deployed wire total");
  assert.equal(decoded.accounts[0].workloads[0].totalAmountExact, "600",
    "Actual-only Workload contribution accepts the deployed wire total");
  assert.equal(decoded.accounts[0].workloads[0].plans[0].totalAmountExact, "600",
    "Actual-only Plan contribution accepts the deployed wire total");
  assert.equal(decoded.contextActualTrend.length, 6, "top-level current-context ACTUAL trend is decoded");
  assert.equal(Object.prototype.hasOwnProperty.call(decoded, "otherContribution"), false,
    "the removed aggregate contribution is not exposed by the frontend API contract");
  assert.equal(decoded.accounts[0].workloads[0].plans[0].actualTrend.length, 6);
  assert.deepEqual(getAlertActualTrend(decoded.accounts[0].workloads[0].plans[0].actualTrend, "FY27-AUG").map((point) => point.periodKey),
    ["FY26-MAR", "FY26-APR", "FY26-MAY", "FY27-JUN", "FY27-JUL", "FY27-AUG"],
    "the selected alert base month anchors the preceding five ACTUAL months");
  assert.equal(decoded.mtdSummary, null, "an OFF response has no provisional MTD summary");

  const ordinaryDecimalAnalysis = {
    ...analysis,
    accounts: analysis.accounts.map((account) => ({ ...account,
      percentage: 33.45,
      workloads: account.workloads.map((workload) => ({ ...workload, percentage: 2.47,
        plans: workload.plans.map((plan) => ({ ...plan, percentage: 2.47 })) })) }))
  };
  runtime.fetch = async () => new Response(JSON.stringify(ordinaryDecimalAnalysis), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
  const ordinaryDecimalDecoded = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" });
  assert.equal(ordinaryDecimalDecoded.accounts[0].workloads[0].percentageExact, "2.47",
    "ordinary server decimals must not fail validation because of binary floating-point multiplication artifacts");

  const exactAmount = (value: number) => String(value);
  const exactWireAnalysis = {
    ...analysis,
    portfolio: { ...analysis.portfolio,
      actualAmount: exactAmount(analysis.portfolio.actualAmount), forecastAmount: exactAmount(analysis.portfolio.forecastAmount),
      totalAmount: exactAmount(analysis.portfolio.totalAmount) },
    quarters: analysis.quarters.map((quarter) => ({ ...quarter,
      actualAmount: exactAmount(quarter.actualAmount), forecastAmount: exactAmount(quarter.forecastAmount),
      totalAmount: exactAmount(quarter.totalAmount),
      qoqChangeAmount: quarter.qoqChangeAmount === null ? null : exactAmount(quarter.qoqChangeAmount),
      qoqChangePercent: quarter.qoqChangePercent === null ? null : exactAmount(quarter.qoqChangePercent) })),
    contextActualTrend: analysis.contextActualTrend.map((point) => ({ ...point,
      actualAmount: point.actualAmount === null ? null : exactAmount(point.actualAmount) })),
    accounts: analysis.accounts.map((account) => ({ ...account,
      actualAmount: exactAmount(account.actualAmount), forecastAmount: exactAmount(account.forecastAmount), totalAmount: exactAmount(account.totalAmount),
      workloads: account.workloads.map((workload) => ({ ...workload,
        actualAmount: exactAmount(workload.actualAmount), forecastAmount: exactAmount(workload.forecastAmount), totalAmount: exactAmount(workload.totalAmount),
        plans: workload.plans.map((plan) => ({ ...plan,
          actualAmount: exactAmount(plan.actualAmount), forecastAmount: exactAmount(plan.forecastAmount), totalAmount: exactAmount(plan.totalAmount),
          actualTrend: plan.actualTrend.map((point) => ({ ...point,
            actualAmount: point.actualAmount === null ? null : exactAmount(point.actualAmount) })) })) })) }))
  };
  runtime.fetch = async () => new Response(JSON.stringify(exactWireAnalysis), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
  const exactDecoded = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" });
  assert.equal(exactDecoded.portfolio.actualAmountExact, "600");
  assert.equal(exactDecoded.portfolio.forecastAmountExact, "400");
  assert.equal(exactDecoded.portfolio.totalAmountExact, "1000");
  assert.equal(exactDecoded.quarters[1].qoqChangePercentExact, "33.3333");
  assert.equal(exactDecoded.accounts[0].workloads[0].plans[0].actualTrend[5].actualAmountExact, "60");
  assert.equal(exactDecoded.portfolio.actualAmountChartCoordinate, 600,
    "the only approximate projection is explicitly named for chart coordinates");

  const mtdAnalysis = { ...analysis,
    selectedPillar: "OCI",
    portfolio: { ...analysis.portfolio, actualAmount: 1850, forecastAmount: 960, totalAmount: 2510, forecastOverlapAmount: 300 },
    quarters: analysis.quarters.map((quarter) => quarter.quarter === "Q2"
      ? { ...quarter, actualAmount: 1700, forecastAmount: 960, totalAmount: 2360, forecastOverlapAmount: 300 }
      : quarter),
    mtdSummary: { periodKey: "FY27-SEP", amount: 1700, asOf: "2026-09-22T09:00:00+09:00" }
  };
  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/analysis?fiscalYear=FY27&search=&account=&salesRep=&pillar=OCI&includeMtd=true");
    return new Response(JSON.stringify(mtdAnalysis), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const withMtd = await fetchConsumptionAnalysis({
    fiscalYear: "FY27", search: "", account: "", pillar: "OCI", includeMtd: true
  });
  assert.equal(withMtd.selectedPillar, "OCI", "MTD responses preserve the selected OCI pillar");
  assert.deepEqual(withMtd.mtdSummary,
    { periodKey: "FY27-SEP", amountExact: "1700", asOf: "2026-09-22T09:00:00+09:00" },
    "MTD responses accept display Forecast while Total excludes the overlapping current-period Forecast");
  assert.equal(withMtd.portfolio.totalAmountExact, "2510");
  assert.equal(withMtd.quarters[1].totalAmountExact, "2360");

  runtime.fetch = async () => new Response(JSON.stringify({
    ...mtdAnalysis,
    portfolio: { ...mtdAnalysis.portfolio, totalAmount: 2810 }
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => fetchConsumptionAnalysis({
    fiscalYear: "FY27", search: "", account: "", pillar: "OCI", includeMtd: true
  }), /Malformed Consumption analysis/,
  "the decoder rejects an Outlook that adds current-month MTD on top of its containing full-month Forecast");

  const closedMtdBaselineAnalysis = {
    ...analysis,
    portfolio: { ...analysis.portfolio, totalAmount: 900, forecastOverlapAmount: 100 },
    quarters: analysis.quarters.map((quarter) => quarter.quarter === "Q2"
      ? { ...quarter, totalAmount: 350, forecastOverlapAmount: 50 }
      : quarter),
    mtdSummary: null
  };
  runtime.fetch = async () => new Response(JSON.stringify(closedMtdBaselineAnalysis), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
  const withClosedMtdBaseline = await fetchConsumptionAnalysis({
    fiscalYear: "FY27", search: "", account: ""
  });
  assert.equal(withClosedMtdBaseline.portfolio.totalAmountExact, "900",
    "a closed-period MTD baseline may overlap a full-month Forecast even when current-month mtdSummary is absent");
  assert.equal(withClosedMtdBaseline.quarters[1].totalAmountExact, "350",
    "closed-period overlap is decoded independently from the current-month MTD display toggle");

  runtime.fetch = async () => new Response(JSON.stringify({ ...mtdAnalysis,
    quarters: mtdAnalysis.quarters.map((quarter) => quarter.quarter === "Q1"
      ? { ...quarter, totalAmount: quarter.totalAmount + 1 }
      : quarter)
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => fetchConsumptionAnalysis({
    fiscalYear: "FY27", search: "", account: "", pillar: "OCI", includeMtd: true
  }), /Malformed Consumption analysis/, "MTD only relaxes additivity for its current fiscal quarter");

  runtime.fetch = async () => new Response(JSON.stringify({ ...mtdAnalysis,
    accounts: [{ ...analysis.accounts[0], totalAmount: analysis.accounts[0].totalAmount + 1 }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => fetchConsumptionAnalysis({
    fiscalYear: "FY27", search: "", account: "", pillar: "OCI", includeMtd: true
  }), /Malformed Consumption analysis/, "MTD does not relax Account, Workload, or Plan amount splits");

  runtime.fetch = async () => new Response(JSON.stringify(deployedNonComparableAnalysis),
    { status: 200, headers: { "Content-Type": "application/json" } });
  const nonComparable = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" });
  assert.deepEqual(nonComparable.quarters.slice(2).map((quarter) => quarter.status), ["NOT_OPEN", "NOT_OPEN"],
    "deployed NOT_OPEN quarter semantics survive decoding");
  assert.equal(nonComparable.salesRepOverview[0].actualGrowthAmountExact, null,
    "unavailable Sales Rep YoY amount remains null");
  assert.equal(nonComparable.accounts[0].actualGrowthAmountExact, null,
    "unavailable Account YoY amount remains null");

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/analysis?fiscalYear=FY27&search=%ED%95%9C%EA%B5%AD&account=Acme&salesRep=Rep+A");
    return new Response(JSON.stringify({ ...analysis, selectedAccount: "Acme", selectedSalesRep: "Rep A" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "한국", account: "Acme", salesRep: "Rep A" });


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
  assert.equal(signedDecoded.portfolio.totalAmountExact, "-50", "valid credits and negative adjustments remain analyzable");
  assert.equal(signedDecoded.accounts[0].totalAmountExact, "-100",
    "a legacy additive wire total is normalized to signed Actual during a rolling cache/API transition");
  assert.equal(signedDecoded.accounts[0].percentageExact, "125", "signed portfolios may produce contribution percentages outside 0–100");

  const zeroDenominatorAnalysis = {
    ...analysis,
    accounts: [{ ...analysis.accounts[0], percentage: null,
      workloads: [{ ...analysis.accounts[0].workloads[0], percentage: null,
        plans: [{ ...analysis.accounts[0].workloads[0].plans[0], percentage: null }] }] }]
  };
  runtime.fetch = async () => new Response(JSON.stringify(zeroDenominatorAnalysis), { status: 200, headers: { "Content-Type": "application/json" } });
  const zeroDenominatorDecoded = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" });
  assert.equal(zeroDenominatorDecoded.accounts[0].percentageExact, null,
    "a zero Actual denominator remains a valid null contribution percentage");
  assert.equal(zeroDenominatorDecoded.accounts[0].workloads[0].plans[0].percentageExact, null);

  for (const malformed of [
    { ...analysis, fiscalYear: "2027" },
    { ...analysis, portfolio: { ...analysis.portfolio, totalAmount: 1001 } },
    { ...analysis, portfolio: { ...analysis.portfolio, coveragePercent: 101 } },
    { ...analysis, quarters: analysis.quarters.slice(0, 3) },
    { ...analysis, quarters: analysis.quarters.map((quarter, index) => index === 0 ? { ...quarter, status: "UNKNOWN" } : quarter) },
    { ...analysis, quarters: analysis.quarters.map((quarter, index) => index === 1 ? { ...quarter, qoqChangePercent: "not-a-decimal" } : quarter) },
    { ...analysis, accounts: [{ ...analysis.accounts[0], percentage: "not-a-decimal" }] },
    { ...analysis, accounts: [analysis.accounts[0], { ...analysis.accounts[0], workloads: [] }] },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [analysis.accounts[0].workloads[0], { ...analysis.accounts[0].workloads[0], plans: [] }] }] },
    { ...analysis, alerts: [analysis.alerts[0], { ...analysis.alerts[0] }] },

    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [{ ...analysis.accounts[0].workloads[0], plans: [{ ...analysis.accounts[0].workloads[0].plans[0], serverPlanId: 9_007_199_254_740_992 }] }] }], alerts: [] },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [{ ...analysis.accounts[0].workloads[0], plans: [{ ...analysis.accounts[0].workloads[0].plans[0], actualTrend: [{ periodKey: "FY27-JUN", actualAmount: 1, alertCalculationMonth: true }, { periodKey: "FY27-JUN", actualAmount: 2, alertCalculationMonth: true }] }] }] }] },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [{ ...analysis.accounts[0].workloads[0], plans: [{ ...analysis.accounts[0].workloads[0].plans[0], actualTrend: [{ periodKey: "FY27-JUL", actualAmount: 1, alertCalculationMonth: true }, { periodKey: "FY27-JUN", actualAmount: 2, alertCalculationMonth: true }] }] }] }] },
    { ...analysis, accounts: [{ ...analysis.accounts[0], workloads: [{ ...analysis.accounts[0].workloads[0], plans: [{ ...analysis.accounts[0].workloads[0].plans[0], actualTrend: [{ periodKey: "FY25-MAY", actualAmount: 1, alertCalculationMonth: true }] }] }] }] }
  ]) {
    runtime.fetch = async () => new Response(JSON.stringify(malformed), { status: 200, headers: { "Content-Type": "application/json" } });
    await assert.rejects(() => fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "" }), /Malformed Consumption analysis/);
  }

  const accountRows = [
    { ...zeroDenominatorDecoded.accounts[0], account: "Zulu", totalAmountExact: "100" },
    { ...zeroDenominatorDecoded.accounts[0], account: "Alpha", totalAmountExact: "300" },
    { ...zeroDenominatorDecoded.accounts[0], account: "Bravo", totalAmountExact: "200" }
  ];
  assert.deepEqual(sortAndFilterConsumptionAccounts(accountRows, "a", "amount", "desc").map((row) => row.account), ["Alpha", "Bravo"]);
  assert.equal(nextConsumptionBatchSize(25, 10), 20);
  assert.equal(nextConsumptionBatchSize(25, 20), 25);
  assert.equal(nextConsumptionBatchSize(8, 10), 8);
  assert.equal(shouldRestartConsumptionRecordsPage(true, "\"v1\"", "\"v2\""), true, "append pages cannot cross ETag snapshots");
  assert.equal(shouldRestartConsumptionRecordsPage(true, "\"v1\"", "\"v1\""), false);
  assert.equal(shouldRestartConsumptionRecordsPage(false, "\"v1\"", "\"v2\""), false);
  assert.equal(shouldRefreshConsumptionAnalysisContext("", "", ""), false,
    "selecting All Accounts Total again is a no-op and must not strand loading");
  assert.equal(shouldRefreshConsumptionAnalysisContext("Acme", "", ""), true,
    "clearing an active account refreshes the portfolio aggregate");
  assert.equal(shouldRefreshConsumptionAnalysisContext("", "", "ac"), true,
    "clearing an active candidate search refreshes the full portfolio aggregate");

  const plan = (id: string, actuals: Record<string, number>, forecasts: Record<string, number>): ConsumptionPlan => ({
    id, customer: "Acme", endUser: id, planId: id, dataCenter: "IAD", planType: "OCI", actuals, forecasts
  });

  assert.deepEqual(resolveConsumptionControlTotal([plan("a", {}, {}), plan("b", {}, {})], "FY27-SEP", undefined),
    { amount: null, amountExact: null, detailState: "MISSING", editable: true, source: "MANUAL" });
  assert.deepEqual(resolveConsumptionControlTotal([plan("a", {}, { "FY27-SEP": 0 }), plan("b", {}, {})], "FY27-SEP", 0),
    { amount: 0, amountExact: "0", detailState: "ZERO", editable: true, source: "MANUAL" }, "explicit zero remains distinct from missing");
  assert.deepEqual(resolveConsumptionControlTotal([plan("a", { "FY27-AUG": 0 }, {}), plan("b", {}, {})], "FY27-AUG", undefined),
    { amount: 0, amountExact: "0", detailState: "ZERO", editable: true, source: "DETAIL" }, "an explicit zero Actual remains visible without a manual Forecast");
  assert.deepEqual(resolveConsumptionControlTotal([plan("a", {}, { "FY27-SEP": 25 }), plan("b", {}, { "FY27-SEP": 0 })], "FY27-SEP", 999),
    { amount: 25, amountExact: "25", detailState: "VALUE", editable: false, source: "DETAIL" }, "a non-zero child value immediately owns the Control Total");

  const compositionAccounts = [
    { account: "Natural", totalForecastAmountExact: "400", newAmountExact: "0", expansionAmountExact: "0", reductionAmountExact: "0", netMovementAmountExact: "0" },
    { account: "New", totalForecastAmountExact: "200", newAmountExact: "200", expansionAmountExact: "0", reductionAmountExact: "0", netMovementAmountExact: "200" },
    { account: "Expansion", totalForecastAmountExact: "250", newAmountExact: "0", expansionAmountExact: "50", reductionAmountExact: "0", netMovementAmountExact: "50" },
    { account: "Reduction", totalForecastAmountExact: "180", newAmountExact: "0", expansionAmountExact: "0", reductionAmountExact: "20", netMovementAmountExact: "-20" },
    { account: "Rounded zero", totalForecastAmountExact: "5", newAmountExact: "4.9", expansionAmountExact: "0", reductionAmountExact: "0", netMovementAmountExact: "4.9" },
    { account: "Visible precision", totalForecastAmountExact: "5", newAmountExact: "5", expansionAmountExact: "0", reductionAmountExact: "0", netMovementAmountExact: "5" }
  ];
  assert.deepEqual(filterForecastCompositionAccounts(compositionAccounts, "All").map((row) => row.account),
    ["Natural", "New", "Expansion", "Reduction", "Rounded zero", "Visible precision"],
    "All preserves the API's full Forecast Total account set, including Base/Natural-only and small positive values");
  assert.deepEqual(filterForecastCompositionAccounts(compositionAccounts, "New").map((row) => row.account),
    ["New", "Rounded zero", "Visible precision"],
    "exact positive values remain visible even when a coarser display would round them to zero");
  assert.deepEqual(filterForecastCompositionAccounts(compositionAccounts, "Expansion").map((row) => row.account), ["Expansion"]);
  assert.deepEqual(filterForecastCompositionAccounts(compositionAccounts, "Reduction").map((row) => row.account), ["Reduction"]);
  console.log("consumptionAnalysis tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
