import assert from "node:assert/strict";
import {
  ConsumptionPlan,
  aggregateConsumptionAccounts,
  buildDisplayQuarterSummaries,
  buildQuarterSummary,
  detectConsumptionSignals,
  getFiscalQuarter,
  getLatestActualMonth,
  getConsumptionPlanLabel,
  getNextQuarterMonths,
  isConsumptionQuarterRangeValid,
  parseConsumptionCsv,
  seedForecastMonths
} from "../src/data/consumptionData";

const csv = [
  "Customer,End User,Sold To,Plan ID,Data Center,Plan Type,FY26-MAR,FY26-APR,FY26-MAY,FY27-JUN,FY27-JUL,FY27-AUG,Total",
  '"Example Account",Multiple,Multiple,,2,Multiple,"$300 ","$400 ","$500 ","$600 ","$700 ","$800 ","$3,300 "',
  '"Example Account","Example End User","Ignored Sold To",PLAN-1,1,OCI,"$100 ","$150 ","$200 ","$250 ","$300 ","$350 ","$1,350 "',
  '"Example Account","Second End User","Ignored Sold To 2",PLAN-2,1,OCI,"$200 ","$250 ","$300 ","$350 ","$400 ","$450 ","$1,950 "'
].join("\n");

const parsed = parseConsumptionCsv(csv);
assert.equal(getConsumptionPlanLabel({ ...parsed.plans[0], workload: "Database" }), "Example Account - Database (PLAN-1)");
assert.equal(getConsumptionPlanLabel(parsed.plans[0]), "Example Account (PLAN-1)");
assert.equal(parsed.plans.length, 2, "Multiple control rows must not become detailed plan facts");
assert.equal(parsed.controlTotals.length, 1, "Multiple rows remain available only as import control totals");
assert.equal("soldTo" in parsed.controlTotals[0], false, "Sold To is removed even from control rows");
assert.deepEqual(parsed.monthKeys, ["FY26-MAR", "FY26-APR", "FY26-MAY", "FY27-JUN", "FY27-JUL", "FY27-AUG"]);
assert.equal(parsed.plans[0].endUser, "Example End User", "End User must be retained");
assert.equal("soldTo" in parsed.plans[0], false, "Sold To must be discarded at the parser boundary");
assert.equal(parsed.plans[0].actuals["FY27-AUG"], 350);
assert.equal(getFiscalQuarter("FY26-MAY"), "FY26-Q4");
assert.equal(getFiscalQuarter("FY27-JUN"), "FY27-Q1");
assert.deepEqual(getNextQuarterMonths("FY27-JUL"), ["FY27-AUG", "FY27-SEP", "FY27-OCT"], "Forecast starts in the month immediately after the last populated Actual");
assert.deepEqual(getNextQuarterMonths("FY27-AUG"), ["FY27-SEP", "FY27-OCT", "FY27-NOV"]);
assert.deepEqual(getNextQuarterMonths("FY27-MAY"), ["FY28-JUN", "FY28-JUL", "FY28-AUG"]);

const sparseCsv = [
  "Customer,End User,Plan ID,Data Center,Plan Type,FY27-JUN,FY27-JUL,FY27-AUG,FY27-SEP",
  "Sparse Account,Sparse Service,SYN-009,DC 1,OCI,100,,200,"
].join("\n");
const sparse = parseConsumptionCsv(sparseCsv);
assert.equal("FY27-JUL" in sparse.plans[0].actuals, false, "blank month cells stay missing rather than becoming zero Actuals");
assert.equal(getLatestActualMonth(sparse.plans), "FY27-AUG", "forecast seeding starts after the last populated Actual, not the last CSV header");
assert.equal(detectConsumptionSignals(sparse.plans).length, 0, "missing months break MoM continuity instead of comparing non-adjacent Actuals");
const sparseAccount = aggregateConsumptionAccounts([
  sparse.plans[0],
  { ...sparse.plans[0], id: "Sparse Account::SYN-010", planId: "SYN-010", actuals: { "FY27-JUN": 50, "FY27-JUL": 50, "FY27-AUG": 50 } }
])[0];
assert.equal("FY27-JUL" in sparseAccount.actuals, false, "an Account month stays incomplete when any detailed Plan is missing its Actual");

const duplicatePlanIdsAcrossAccounts = parseConsumptionCsv([
  "Customer,End User,Plan ID,Data Center,Plan Type,FY27-AUG",
  "Account One,Service One,SHARED-001,DC 1,OCI,100",
  "Account Two,Service Two,SHARED-001,DC 2,OCI,200"
].join("\n"));
assert.deepEqual(
  duplicatePlanIdsAcrossAccounts.plans.map((plan: ConsumptionPlan) => plan.id),
  ["Account One::SHARED-001", "Account Two::SHARED-001"],
  "row identity remains account-scoped when Plan IDs repeat across accounts"
);

assert.throws(
  () => parseConsumptionCsv(sparseCsv.replace(",,200,", ",not-a-number,200,")),
  /invalid FY27-JUL amount/i,
  "malformed amount cells fail import instead of silently becoming zero"
);
for (const malformed of ["1 2", "1e3", "0x10", "1,2"]) {
  const csvCell = malformed.includes(",") ? `"${malformed}"` : malformed;
  assert.throws(
    () => parseConsumptionCsv(sparseCsv.replace(",,200,", `,${csvCell},200,`)),
    /invalid FY27-JUL amount/i,
    `non-decimal amount ${malformed} is rejected instead of being coerced`
  );
}

const account = aggregateConsumptionAccounts(parsed.plans)[0];
assert.equal(account.actuals["FY27-AUG"], 800, "account totals must sum detailed plans only once");

const fy26q4 = buildQuarterSummary(account, "FY26-Q4", null);
assert.deepEqual(fy26q4, {
  quarter: "FY26-Q4",
  months: ["FY26-MAR", "FY26-APR", "FY26-MAY"],
  total: 1200,
  status: "ACTUAL",
  preQGap: null
});
const fy27q1 = buildQuarterSummary(account, "FY27-Q1", fy26q4);
assert.equal(fy27q1.total, 2100);
assert.equal(fy27q1.preQGap, 900, "PreQ Gap must compare adjacent effective quarter totals");
assert.equal(fy27q1.status, "ACTUAL");

const forecasted = seedForecastMonths(parsed.plans, ["FY27-SEP", "FY27-OCT", "FY27-NOV"]);
assert.equal(forecasted[0].forecasts["FY27-SEP"], 350, "next-quarter seed uses the latest actual as an editable draft baseline");
const preserved = seedForecastMonths([{ ...parsed.plans[0], forecasts: { "FY27-SEP": 999 } }], ["FY27-SEP", "FY27-OCT"]);
assert.equal(preserved[0].forecasts["FY27-SEP"], 999, "authoritative persisted forecasts must not be overwritten by seed defaults");
assert.equal(preserved[0].forecasts["FY27-OCT"], 350, "missing forecast months still receive a seed default");
const forecastAccount = aggregateConsumptionAccounts(forecasted)[0];
const fy27q2 = buildQuarterSummary(forecastAccount, "FY27-Q2", fy27q1);
assert.equal(fy27q2.total, 2400);
assert.equal(fy27q2.status, "FORECAST");
assert.equal(fy27q2.preQGap, 300);

assert.equal(isConsumptionQuarterRangeValid("FY26-Q4", "FY27-Q1"), true);
assert.equal(isConsumptionQuarterRangeValid("FY27-Q2", "FY27-Q1"), false, "a reversed From/To range is invalid");
const displaySeries: ConsumptionPlan = {
  id: "display", customer: "Display Account", endUser: "Display End User", planId: "DISPLAY", dataCenter: "1", planType: "OCI",
  actuals: {
    "FY26-MAR": 5, "FY26-APR": 5, "FY26-MAY": 5,
    "FY27-JUN": 10, "FY27-JUL": 10, "FY27-AUG": 10
  },
  forecasts: { "FY27-SEP": 20, "FY27-OCT": 20, "FY27-NOV": 20 }
};
const displaySummaries = buildDisplayQuarterSummaries(displaySeries, ["FY27-Q1", "FY27-Q2", "FY26-Q4", "FY27-Q1"]);
assert.deepEqual(displaySummaries.map((summary) => summary.quarter), ["FY27-Q1", "FY27-Q2", "FY26-Q4"], "backend display order is preserved without duplicate quarters");
assert.equal(displaySummaries[0].preQGap, 15, "a displayed history quarter compares with its chronological predecessor");
assert.equal(displaySummaries[1].preQGap, 30, "a displayed forecast quarter compares with its chronological predecessor");
assert.equal(displaySummaries[2].preQGap, null, "the first chronological quarter has no predecessor in the returned range");

const offscreenPriorSummaries = buildDisplayQuarterSummaries(displaySeries, ["FY27-Q1", "FY27-Q2"]);
assert.equal(offscreenPriorSummaries[0].preQGap, 15, "the first displayed quarter uses a supplied offscreen prior quarter for PreQ Gap");

const signalPlan = (
  id: string,
  actuals: Record<string, number>,
  customer = "Signal Account"
): ConsumptionPlan => ({
  id,
  customer,
  endUser: `${id} End User`,
  planId: id,
  dataCenter: "1",
  planType: "OCI",
  actuals,
  forecasts: {}
});
const signalMonths = ["FY27-JUN", "FY27-JUL", "FY27-AUG", "FY27-SEP", "FY27-OCT"];
const values = (items: number[]) => Object.fromEntries(signalMonths.map((month, index) => [month, items[index]]));
const signals = detectConsumptionSignals([
  signalPlan("SPIKE", values([100, 100, 100, 100, 500])),
  signalPlan("DROP", values([500, 500, 500, 500, 100])),
  signalPlan("UP", values([100, 140, 200, 280, 390])),
  signalPlan("DOWN", values([500, 420, 330, 240, 150])),
  signalPlan("NEW", values([0, 0, 0, 0, 300])),
  signalPlan("STOPPED", values([300, 300, 300, 0, 0])),
  signalPlan("STALE", { "FY27-JUN": 100, "FY27-JUL": 500 })
]);
assert.deepEqual(new Set(signals.map((signal) => signal.type)), new Set(["SPIKE", "DROP"]), "only latest-month SPIKE and DROP are detectable");
assert.deepEqual(new Set(signals.map((signal) => signal.planId)), new Set(["SPIKE", "DROP"]), "long trends, zero baselines and missing global comparison months are excluded");
assert.equal(signals.every((signal) => signal.month === "FY27-OCT" && signal.changePercent !== null), true, "all signals use the shared latest comparison month and have a valid percentage");
assert.equal(signals.every((signal) => Boolean(signal.customer && signal.endUser && signal.planId && signal.month && signal.reason)), true);

console.log("consumptionData tests passed");
