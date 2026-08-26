import assert from "node:assert/strict";
import {
  canUseConsumptionFallback,
  ConsumptionConflictError,
  ConsumptionNetworkError,
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
  assert.equal(workspace.plans[0].forecasts["FY27-NOV"], 100, "only a missing editable forecast month receives the seed default");
  assert.equal("FY27-SEP" in workspace.plans[0].forecasts, true);
  assert.equal(workspace.plans[0].versions?.["FY27-OCT"], 3);

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
  assert.equal(summaries[0].status, "FORECAST");
  assert.deepEqual(summaries[0].months.map((month) => pastRange.plans[0].forecasts[month]), [100, 100, 100], "all Forecast months are projected and seeded from the current Actual");
  assert.equal(summaries[0].total, 300);

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
    ...payload,
    signals: [{ signalId: 1, planId: 11, account: "A", endUser: "EU", planCode: "P1", periodKey: "FY27-OCT",
      type: "SPIKE", grade: "UNTRUSTED", changeAmount: 1, changePercent: 1, reason: "bad" }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"malformed-signal"' } });
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
