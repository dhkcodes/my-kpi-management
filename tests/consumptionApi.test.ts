import assert from "node:assert/strict";
import {
  canUseConsumptionFallback,
  ConsumptionConflictError,
  ConsumptionNetworkError,
  fetchConsumptionRecords,
  fetchConsumptionWorkspace,
  saveConsumptionForecasts
} from "../src/data/consumptionApi";
import { buildDisplayQuarterSummaries } from "../src/data/consumptionData";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string; fetch: typeof fetch };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";
const payload = {
  etag: '"body-etag"', lastBatchId: 7,
  currentFiscalMonth: "FY27-AUG", fromQuarter: "FY26-Q1", toQuarter: "FY27-Q1",
  editablePeriodIds: ["FY27-SEP", "FY27-OCT", "FY27-NOV"],
  displayQuarterOrder: ["FY27-Q2", "FY27-Q1", "FY26-Q4", "FY26-Q3", "FY26-Q2", "FY26-Q1"],
  plans: [{ planId: 11, stableKey: "A::EU::P1::DC", account: "A", endUser: "EU", planCode: "P1", dataCenter: "DC", workload: "Autonomous Database",
    facts: [{ periodKey: "FY27-AUG", actualAmount: 100, forecastAmount: null, versionNo: 1 },
      { periodKey: "FY27-OCT", actualAmount: null, forecastAmount: 999, versionNo: 3 }] }],
  controlTotals: [
    { account: "A", periodKey: "FY27-AUG" }, { account: "A", periodKey: "FY27-SEP" },
    { account: "B", periodKey: "FY27-AUG" }, { account: "B", periodKey: "FY27-SEP" }
  ], signals: []
};
const changeSignal = {
  signalId: 11, planId: 11, account: "A", endUser: "EU", planCode: "P1", periodKey: "FY27-JUL",
  type: "NEW_USAGE", grade: "WATCH", latestActual: 52, baselineMedian: 0, changeAmount: 52,
  changePercent: null, mad: 0, allowance: 50, previousActual: 92, previousDirection: "DECREASED",
  sparkline: [
    { periodKey: "FY26-APR", actualAmount: 0 }, { periodKey: "FY26-MAY", actualAmount: 0 },
    { periodKey: "FY27-JUN", actualAmount: 92 }, { periodKey: "FY27-JUL", actualAmount: 52 }
  ], reason: "New consumption exceeded the usual zero baseline and decreased versus the previous month."
};
runtime.fetch = async (input) => {
  assert.equal(String(input), "http://unit.test/api/v1/consumption/workspace?fromQuarter=FY26-Q1&toQuarter=FY27-Q1");
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json", ETag: '"header-etag"' } });
};

void (async () => {
  const workspace = await fetchConsumptionWorkspace({ fromQuarter: "FY26-Q1", toQuarter: "FY27-Q1" });
  assert.equal(workspace.etag, '"header-etag"');
  assert.equal(workspace.currentFiscalMonth, "FY27-AUG");
  assert.equal(workspace.fromQuarter, "FY26-Q1");
  assert.equal(workspace.toQuarter, "FY27-Q1");
  assert.deepEqual(workspace.editablePeriodIds, ["FY27-SEP", "FY27-OCT", "FY27-NOV"]);
  assert.deepEqual(workspace.displayQuarterOrder, ["FY27-Q2", "FY27-Q1", "FY26-Q4", "FY26-Q3", "FY26-Q2", "FY26-Q1"]);
  assert.equal(workspace.controlTotalCount, 2, "monthly control entries must be reported as two source Multiple controls");
  assert.equal(workspace.plans[0].workload, "Autonomous Database", "Plan Number mapping exposes its Workload without a client-side lookup");
  assert.equal(workspace.plans[0].forecasts["FY27-OCT"], 999, "persisted server forecast must remain authoritative");
  assert.equal(workspace.plans[0].forecasts["FY27-NOV"], undefined, "a missing editable forecast month remains absent");
  assert.equal("FY27-SEP" in workspace.plans[0].forecasts, false);
  assert.equal(workspace.plans[0].versions?.["FY27-OCT"], 3);

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/records?fromQuarter=FY26-Q1&toQuarter=FY27-Q1&search=database&sort=AMOUNT&direction=DESC&offset=10&limit=10");
    return new Response(JSON.stringify({
      etag: '\"records-etag\"', lastBatchId: 7,
      currentFiscalMonth: payload.currentFiscalMonth, fromQuarter: payload.fromQuarter, toQuarter: payload.toQuarter,
      editablePeriodIds: payload.editablePeriodIds, displayQuarterOrder: payload.displayQuarterOrder,
      accountGroups: [{ account: "A", plans: payload.plans }], totalAccounts: 11, nextOffset: 11, hasMore: false
    }), { status: 200, headers: { "Content-Type": "application/json", ETag: '\"records-header\"' } });
  };
  const records = await fetchConsumptionRecords({ fromQuarter: "FY26-Q1", toQuarter: "FY27-Q1", search: "database",
    sort: "AMOUNT", direction: "DESC", offset: 10, limit: 10 });
  assert.equal(records.etag, '\"records-header\"');
  assert.deepEqual(records.accountGroups.map((group) => group.account), ["A"]);
  assert.equal(records.accountGroups[0].plans[0].workload, "Autonomous Database");
  assert.deepEqual([records.totalAccounts, records.nextOffset, records.hasMore], [11, 11, false]);

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/records?fromQuarter=&toQuarter=&search=&sort=ACCOUNT&direction=ASC&offset=0&limit=10");
    return new Response(JSON.stringify({
      etag: '\"default-range\"', lastBatchId: 7,
      currentFiscalMonth: payload.currentFiscalMonth, fromQuarter: payload.fromQuarter, toQuarter: payload.toQuarter,
      editablePeriodIds: payload.editablePeriodIds, displayQuarterOrder: payload.displayQuarterOrder,
      accountGroups: [{ account: "A", plans: payload.plans }], totalAccounts: 1, nextOffset: 1, hasMore: false
    }), { status: 200, headers: { "Content-Type": "application/json", ETag: '\"default-range\"' } });
  };
  const defaultRangeRecords = await fetchConsumptionRecords({ fromQuarter: "", toQuarter: "", search: "",
    sort: "ACCOUNT", direction: "ASC", offset: 0, limit: 10 });
  assert.deepEqual([defaultRangeRecords.fromQuarter, defaultRangeRecords.toQuarter], ["FY26-Q1", "FY27-Q1"]);

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload,
    signals: [changeSignal]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"change"' } });
  const changeWorkspace = await fetchConsumptionWorkspace();
  assert.deepEqual(
    [changeWorkspace.signals[0].type, changeWorkspace.signals[0].previousDirection,
      changeWorkspace.signals[0].serverPlanId, changeWorkspace.signals[0].planId],
    ["NEW_USAGE", "DECREASED", 11, "P1"],
    "usual-level classification, previous-month direction and numeric Plan identity remain independent"
  );

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload,
    fromQuarter: "FY26-Q4", toQuarter: "FY26-Q4", displayQuarterOrder: ["FY27-Q2", "FY26-Q4"],
    plans: [{ ...payload.plans[0], facts: [
      { periodKey: "FY27-AUG", actualAmount: 100, forecastAmount: null, versionNo: 1 },
      { periodKey: "FY26-MAR", actualAmount: 70, forecastAmount: null, versionNo: 1 },
      { periodKey: "FY26-APR", actualAmount: 80, forecastAmount: null, versionNo: 1 },
      { periodKey: "FY26-MAY", actualAmount: 90, forecastAmount: null, versionNo: 1 }
    ] }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"past-range"' } });
  const pastRange = await fetchConsumptionWorkspace({ fromQuarter: "FY26-Q4", toQuarter: "FY26-Q4" });
  assert.deepEqual(pastRange.displayQuarterOrder, ["FY27-Q2", "FY26-Q4"], "Forecast stays left of a historical To Quarter");
  const summaries = buildDisplayQuarterSummaries(pastRange.plans[0], pastRange.displayQuarterOrder);
  assert.equal(summaries[0].status, "INCOMPLETE");
  assert.deepEqual(summaries[0].months.map((month) => pastRange.plans[0].forecasts[month]), [undefined, undefined, undefined], "missing future months remain absent instead of becoming generated Forecast values");
  assert.equal(summaries[0].total, null);

  runtime.fetch = async () => new Response(JSON.stringify({
    etag: '"legacy-etag"', lastBatchId: null, plans: payload.plans,
    controlTotals: payload.controlTotals, signals: []
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"legacy-etag"' } });
  const compatible = await fetchConsumptionWorkspace();
  assert.equal(compatible.currentFiscalMonth, "FY27-AUG", "legacy workspaces derive the latest Actual fiscal month");
  assert.deepEqual(compatible.editablePeriodIds, ["FY27-SEP", "FY27-OCT", "FY27-NOV"]);
  assert.deepEqual(compatible.displayQuarterOrder.slice(0, 2), ["FY27-Q2", "FY27-Q1"]);

  let putInit: RequestInit | undefined;
  runtime.fetch = async (_input, init) => {
    putInit = init;
    return new Response(JSON.stringify({ ...payload, etag: '"next-etag"' }), { status: 200, headers: { ETag: '"next-etag"' } });
  };
  const saved = await saveConsumptionForecasts('"header-etag"', [{ planId: 11, periodKey: "FY27-OCT", amount: 1001, versionNo: 3 }]);
  assert.equal(putInit?.method, "PUT");
  assert.equal((putInit?.headers as Record<string, string>)["If-Match"], '"header-etag"');
  assert.deepEqual(JSON.parse(String(putInit?.body)), { updates: [{ planId: 11, periodKey: "FY27-OCT", amount: 1001, versionNo: 3 }] });
  assert.equal(saved.etag, '"next-etag"');

  runtime.fetch = async () => new Response(JSON.stringify({
    workspace: payload, planCount: 1, controlTotalCount: 0, insertedCount: 0, updatedCount: 1, appliedCount: 1
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"import-etag"' } });
  const { applyConsumptionImport } = await import("../src/data/consumptionApi");
  const imported = await applyConsumptionImport("csv");
  assert.deepEqual([imported.insertedCount, imported.updatedCount, imported.appliedCount], [0, 1, 1], "overwrite counts are preserved for the import result UI");

  runtime.fetch = async () => new Response(JSON.stringify({
    code: "VERSION_CONFLICT", message: "changed", current: { ...payload, etag: '"current-etag"' }
  }), { status: 409, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    () => saveConsumptionForecasts('"stale"', [{ planId: 11, periodKey: "FY27-OCT", amount: 1002, versionNo: 3 }]),
    (error: unknown) => error instanceof ConsumptionConflictError && error.current.etag === '"current-etag"'
  );

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload,
    plans: [{ ...payload.plans[0], facts: [{ ...payload.plans[0].facts[0], versionNo: "1" }] }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"malformed-fact"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption fact response/);

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, signals: [{ ...changeSignal, grade: "UNTRUSTED" }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"malformed-signal"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption signal response/);

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, signals: [{ ...changeSignal, allowance: 51 }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"malformed-threshold"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption signal response/);

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, signals: [{ ...changeSignal, previousDirection: "INCREASED" }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"malformed-direction"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption signal response/);

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, signals: [{ ...changeSignal, baselineMedian: 1, changeAmount: 51, allowance: 50, type: "ABOVE_USUAL", changePercent: 5100 }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"mismatched-median"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption signal response/,
    "decoder rejects a baseline median that contradicts the first three sparkline points");

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, signals: [{ ...changeSignal, mad: 1 }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"mismatched-mad"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption signal response/,
    "decoder rejects a MAD that contradicts the first three sparkline points");

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, signals: [{ ...changeSignal, type: "RISING" }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"legacy-trend-signal"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption signal response/);

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, signals: [{ ...changeSignal, sparkline: changeSignal.sparkline.slice(1) }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"malformed-sparkline"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption signal response/);

  runtime.fetch = async () => new Response(JSON.stringify({ ...payload, lastBatchId: "7" }),
    { status: 200, headers: { "Content-Type": "application/json", ETag: '"malformed-metadata"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption workspace metadata/);

  delete runtime.__KPI_API_BASE_URL__;
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: { hostname: "127.0.0.1" } });
  assert.equal(canUseConsumptionFallback(new ConsumptionNetworkError(new Error("offline"))), true);
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: { hostname: "production.example" } });
  assert.equal(canUseConsumptionFallback(new ConsumptionNetworkError(new Error("offline"))), false);
  console.log("consumptionApi tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
