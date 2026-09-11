import assert from "node:assert/strict";
import {
  canUseConsumptionFallback,
  ConsumptionConflictError,
  ConsumptionNetworkError,
  exportConsumptionImportCompatibleCsv,
  exportConsumptionForecastCsv,
  fetchConsumptionRecords,
  fetchConsumptionWorkspace,
  previewConsumptionForecastWide,
  saveConsumptionForecasts
} from "../src/data/consumptionApi";
import { buildDisplayQuarterSummaries } from "../src/data/consumptionData";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string; fetch: typeof fetch };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";
const payload = {
  selectedPillar: "ALL",
  availablePillars: ["ALL", "DP", "OCI_OTHER"], aggregationGrain: "PLAN_PERIOD",
  etag: '"body-etag"', lastBatchId: 7,
  currentFiscalMonth: "FY27-AUG", fromQuarter: "FY26-Q1", toQuarter: "FY27-Q1",
  editablePeriodIds: ["FY27-SEP", "FY27-OCT", "FY27-NOV"],
  displayQuarterOrder: ["FY27-Q2", "FY27-Q1", "FY26-Q4", "FY26-Q3", "FY26-Q2", "FY26-Q1"],
  plans: [{ planId: 11, stableKey: "A::EU::P1::DC", account: "A", endUser: "EU", planCode: "P1", dataCenter: "DC", dpDataCenterCount: null, ociOtherDataCenterCount: null, workload: "Autonomous Database",
    facts: [{ periodKey: "FY27-AUG", actualAmount: 100, forecastAmount: null, versionNo: 1, pillar: "ALL" },
      { periodKey: "FY27-OCT", actualAmount: null, forecastAmount: 999, versionNo: 3, pillar: null }] }],
  controlTotals: [
    { account: "A", periodKey: "FY27-AUG", controlAmount: 100, detailAmount: 100, matchStatus: "MATCH", pillar: "ALL" },
    { account: "A", periodKey: "FY27-SEP", controlAmount: 999, detailAmount: null, matchStatus: "NO_DETAIL", pillar: "ALL" },
    { account: "A", periodKey: "FY27-OCT", controlAmount: 777, detailAmount: null, matchStatus: "MANUAL_FORECAST", pillar: "ALL" },
    { account: "B", periodKey: "FY27-AUG", controlAmount: 50, detailAmount: 50, matchStatus: "MATCH", pillar: "ALL" },
    { account: "B", periodKey: "FY27-SEP", controlAmount: 0, detailAmount: 0, matchStatus: "MATCH", pillar: "ALL" }
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
  assert.equal(workspace.controlTotals.find((control) => control.periodKey === "FY27-OCT")?.matchStatus, "MANUAL_FORECAST");
  assert.equal(workspace.plans[0].workload, "Autonomous Database", "Plan Number mapping exposes its Workload without a client-side lookup");
  assert.equal(workspace.plans[0].forecasts["FY27-OCT"], 999, "persisted server forecast must remain authoritative");
  assert.equal(workspace.plans[0].forecasts["FY27-NOV"], undefined, "a missing editable forecast month remains absent");
  assert.equal("FY27-SEP" in workspace.plans[0].forecasts, false);
  assert.equal(workspace.plans[0].versions?.["FY27-OCT"], 3);

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/records?fromQuarter=FY26-Q1&toQuarter=FY27-Q1&search=database&sort=AMOUNT&direction=DESC&offset=10&limit=10");
    return new Response(JSON.stringify({
      selectedPillar: "ALL", etag: '\"records-etag\"', lastBatchId: 7,
      currentFiscalMonth: payload.currentFiscalMonth, fromQuarter: payload.fromQuarter, toQuarter: payload.toQuarter,
      editablePeriodIds: payload.editablePeriodIds, displayQuarterOrder: payload.displayQuarterOrder,
      controlTotals: payload.controlTotals,
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
    assert.match(String(input), /offset=11&limit=10$/);
    return new Response(JSON.stringify({
      selectedPillar: "ALL", etag: '"forecast-only-page"', lastBatchId: 7,
      currentFiscalMonth: payload.currentFiscalMonth, fromQuarter: payload.fromQuarter, toQuarter: payload.toQuarter,
      editablePeriodIds: payload.editablePeriodIds, displayQuarterOrder: payload.displayQuarterOrder, controlTotals: [],
      accountForecasts: [{ account: "Forecast Only", normalizedAccount: "FORECAST ONLY", periodKey: "FY27-OCT", pillar: "DP",
        amount: 25, totalAmount: 25, newAmount: 5, expansionAmount: 7, baseAmount: 13, reductionAmount: 2,
        previousAmount: 15, previousSource: "PRIOR_QUARTER_ACTUAL", previousStatus: "AVAILABLE",
        compositionStatus: "CLASSIFIED", version: 1, status: "DRAFT", completeness: "COMPLETE" }],
      forecastVariances: [{ account: "Forecast Only", normalizedAccount: "FORECAST ONLY", periodKey: "FY27-OCT", pillar: "ALL", actualAmount: null, forecastAmount: null, varianceAmount: null, variancePercent: null, completeness: "INCOMPLETE" }],
      accountGroups: [{ account: "Forecast Only", plans: [] }], totalAccounts: 12, nextOffset: 12, hasMore: false
    }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"forecast-only-page"' } });
  };
  const forecastOnlyPage = await fetchConsumptionRecords({ fromQuarter: "FY26-Q1", toQuarter: "FY27-Q1", search: "",
    sort: "ACCOUNT", direction: "ASC", offset: 11, limit: 10 });
  assert.deepEqual(forecastOnlyPage.accountGroups, [{ account: "Forecast Only", plans: [] }]);
  assert.deepEqual([forecastOnlyPage.nextOffset, forecastOnlyPage.hasMore], [12, false]);
  assert.deepEqual(forecastOnlyPage.accountForecasts[0], {
    account: "Forecast Only", normalizedAccount: "FORECAST ONLY", periodKey: "FY27-OCT", pillar: "DP",
    amount: 25, totalAmount: 25, newAmount: 5, expansionAmount: 7, baseAmount: 13, reductionAmount: 2,
    previousAmount: 15, previousSource: "PRIOR_QUARTER_ACTUAL", previousStatus: "AVAILABLE",
    compositionStatus: "CLASSIFIED", version: 1, status: "DRAFT", completeness: "COMPLETE"
  }, "Usage Records preserves every forecast-composition field supplied by the backend");

  runtime.fetch = async () => new Response(JSON.stringify({
    selectedPillar: "ALL", etag: '"negative-composition"', lastBatchId: 7,
    currentFiscalMonth: payload.currentFiscalMonth, fromQuarter: payload.fromQuarter, toQuarter: payload.toQuarter,
    editablePeriodIds: payload.editablePeriodIds, displayQuarterOrder: payload.displayQuarterOrder, controlTotals: [],
    accountForecasts: [{ account: "Forecast Only", normalizedAccount: "FORECAST ONLY", periodKey: "FY27-OCT", pillar: "DP",
      amount: 25, totalAmount: -1, newAmount: 5, expansionAmount: 7, baseAmount: 13, reductionAmount: 2,
      previousAmount: 15, previousSource: "PRIOR_QUARTER_ACTUAL", previousStatus: "AVAILABLE",
      compositionStatus: "CLASSIFIED", version: 1, status: "DRAFT", completeness: "COMPLETE" }],
    forecastVariances: [], accountGroups: [{ account: "Forecast Only", plans: [] }], totalAccounts: 1, nextOffset: 1, hasMore: false
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => fetchConsumptionRecords({ fromQuarter: "FY26-Q1", toQuarter: "FY27-Q1", search: "",
    sort: "ACCOUNT", direction: "ASC", offset: 0, limit: 10 }), /Malformed Consumption account forecast/,
  "Usage Records rejects a negative composition amount instead of replacing the validated amount");

  runtime.fetch = async (input, init) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/exports/import-compatible");
    assert.equal(init?.method, "GET");
    return new Response("\uFEFFCustomer,End User,Sold To,Plan ID,Data Center,Plan Type,FY27-AUG,Total\r\nA,EU,,P1,DC,OCI,$100,$100\r\n", {
      status: 200,
      headers: { "Content-Type": "text/csv;charset=UTF-8", "Content-Disposition": 'attachment; filename="consumption-actuals-export.csv"' }
    });
  };
  const exported = await exportConsumptionImportCompatibleCsv();
  assert.equal(exported.fileName, "consumption-actuals-export.csv");
  const exportedBytes = new Uint8Array(await exported.blob.arrayBuffer());
  assert.deepEqual([...exportedBytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(await exported.blob.text(), /^Customer,End User,Sold To,Plan ID,Data Center,Plan Type,/);

  runtime.fetch = async (input, init) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/exports/forecast?pillar=DP");
    assert.equal(init?.method, "GET");
    return new Response("\uFEFFaccount_name,pillar,FY27-SEP,FY27-OCT,FY27-NOV\r\nA,DP,,999,\r\n", {
      status: 200,
      headers: { "Content-Type": "text/csv;charset=UTF-8", "Content-Disposition": 'attachment; filename="consumption-forecast-dp-export.csv"' }
    });
  };
  const forecastExported = await exportConsumptionForecastCsv("DP");
  assert.equal(forecastExported.fileName, "consumption-forecast-dp-export.csv");
  assert.match(await forecastExported.blob.text(), /^account_name,pillar,FY27-SEP,FY27-OCT,FY27-NOV/);

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/records?fromQuarter=&toQuarter=&search=&sort=ACCOUNT&direction=ASC&offset=0&limit=10");
    return new Response(JSON.stringify({
      selectedPillar: "ALL", etag: '\"default-range\"', lastBatchId: 7,
      currentFiscalMonth: payload.currentFiscalMonth, fromQuarter: payload.fromQuarter, toQuarter: payload.toQuarter,
      editablePeriodIds: payload.editablePeriodIds, displayQuarterOrder: payload.displayQuarterOrder,
      controlTotals: payload.controlTotals,
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
  assert.equal(summaries[0].total, 0, "missing forecast months contribute zero to the quarter total");

  runtime.fetch = async () => new Response(JSON.stringify({
    selectedPillar: "ALL", etag: '"legacy-etag"', lastBatchId: null, plans: payload.plans,
    controlTotals: payload.controlTotals, signals: []
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"legacy-etag"' } });
  const compatible = await fetchConsumptionWorkspace();
  assert.equal(compatible.currentFiscalMonth, "FY27-AUG", "legacy workspaces derive the latest Actual fiscal month");
  assert.deepEqual(compatible.editablePeriodIds, ["FY27-SEP", "FY27-OCT", "FY27-NOV"]);
  assert.deepEqual(compatible.displayQuarterOrder.slice(0, 2), ["FY27-Q2", "FY27-Q1"]);

  let putInit: RequestInit | undefined;
  runtime.fetch = async (_input, init) => {
    putInit = init;
    return new Response(JSON.stringify({ ...payload, selectedPillar: "DP", plans: [], controlTotals: [], etag: '"next-etag"' }), { status: 200, headers: { ETag: '"next-etag"' } });
  };
  const saved = await saveConsumptionForecasts('"header-etag"', [{ account: "A", periodKey: "FY27-OCT", pillar: "DP", amount: 1001 }], "DP");
  assert.equal(putInit?.method, "PUT");
  assert.equal((putInit?.headers as Record<string, string>)["If-Match"], '"header-etag"');
  assert.deepEqual(JSON.parse(String(putInit?.body)), { updates: [], controlUpdates: [{ account: "A", periodKey: "FY27-OCT", pillar: "DP", amount: 1001 }] });
  assert.equal(saved.etag, '"next-etag"');
  await saveConsumptionForecasts('"next-etag"', [{ account: "A", periodKey: "FY27-OCT", pillar: "DP", amount: 0 }], "DP");
  assert.deepEqual(JSON.parse(String(putInit?.body)), {
    updates: [], controlUpdates: [{ account: "A", periodKey: "FY27-OCT", pillar: "DP", amount: 0 }]
  }, "a numeric zero Control Total remains distinct from a missing/null control");

  runtime.fetch = async () => new Response(JSON.stringify({
    workspace: payload, planCount: 1, controlTotalCount: 0, insertedCount: 0, updatedCount: 1, appliedCount: 1
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"import-etag"' } });
  const { applyConsumptionImport } = await import("../src/data/consumptionApi");
  const imported = await applyConsumptionImport("csv");
  assert.deepEqual([imported.insertedCount, imported.updatedCount, imported.appliedCount], [0, 1, 1], "overwrite counts are preserved for the import result UI");

  for (const selectedPillar of ["DP", "OCI_OTHER"] as const) {
    runtime.fetch = async () => new Response(JSON.stringify({
      code: "VERSION_CONFLICT", message: "changed",
      current: { ...payload, selectedPillar, etag: '"current-etag"', plans: [], controlTotals: [], accountForecasts: [] }
    }), { status: 409, headers: { "Content-Type": "application/json" } });
    await assert.rejects(
      () => saveConsumptionForecasts('"stale"', [{ account: "A", periodKey: "FY27-OCT", pillar: selectedPillar, amount: 1002 }], selectedPillar),
      (error: unknown) => error instanceof ConsumptionConflictError
        && error.current.etag === '"current-etag"'
        && error.current.selectedPillar === selectedPillar,
      `${selectedPillar} conflicts retain the selected pillar for the conflict comparison UI`
    );
  }

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

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, controlTotals: [{ ...payload.controlTotals[0], matchStatus: "USER_EDIT" }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"invalid-control-status"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption control total response/);

  runtime.fetch = async () => new Response(JSON.stringify({
    ...payload, controlTotals: [payload.controlTotals[0], { ...payload.controlTotals[0] }]
  }), { status: 200, headers: { "Content-Type": "application/json", ETag: '"duplicate-control"' } });
  await assert.rejects(() => fetchConsumptionWorkspace(), /Malformed Consumption control total response/);

  runtime.fetch = async () => new Response(JSON.stringify({
    etag: "cm-reference", sources: [{ fileName: "forecast.csv", sha256: "a".repeat(64) }],
    lines: [{ accountName: "A", normalizedAccount: "A", periodKey: "FY27-SEP", amount: 7, totalAmount: 7,
      newAmount: 1, expansionAmount: 2, baseAmount: 4, reductionAmount: 3, reductionBasis: "PRIOR_QUARTER_ACTUAL",
      compositionStatus: "CLASSIFIED", sourceFile: "forecast.csv", sourceRow: 2 }],
    populatedCellCount: 1, canonicalPeriods: ["FY27-SEP"],
    referenceColumns: ["reference_prior_quarter", "reference_prior_quarter_actual"],
    referenceNotice: "Prior-quarter Actual columns are read-only references and are never imported."
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const referencePreview = await previewConsumptionForecastWide(new File(["csv"], "forecast.csv"));
  assert.deepEqual(referencePreview.referenceColumns, ["reference_prior_quarter", "reference_prior_quarter_actual"]);
  assert.match(referencePreview.referenceNotice ?? "", /read-only.*never imported/i);
  assert.deepEqual(referencePreview.changes[0], {
    rowNumber: 2, account: "A", resolvedAccount: "A", endUser: null, planCode: null, periodKey: "FY27-SEP",
    forecastAmount: 7, totalAmount: 7, newAmount: 1, expansionAmount: 2, baseAmount: 4, reductionAmount: 3,
    previousSource: "PRIOR_QUARTER_ACTUAL", compositionStatus: "CLASSIFIED", rawValue: "7|1|2",
    existingForecastAmount: null, resolution: "PLAN_UNASSIGNED"
  }, "Forecast Preview decodes raw-to-canonical movement composition and its prior basis");
  assert.deepEqual(referencePreview.canonicalPeriods, ["FY27-SEP"], "allowed periods come from the backend preview contract");

  runtime.fetch = async () => new Response(JSON.stringify({
    etag: "cm-negative", sources: [{ fileName: "forecast.csv", sha256: "c".repeat(64) }],
    lines: [{ accountName: "A", normalizedAccount: "A", periodKey: "FY27-SEP", amount: 7, totalAmount: 7,
      newAmount: -1, expansionAmount: 2, baseAmount: 6, reductionAmount: 3,
      compositionStatus: "CLASSIFIED", sourceRow: 2 }],
    populatedCellCount: 1, canonicalPeriods: ["FY27-SEP"]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => previewConsumptionForecastWide(new File(["csv"], "forecast.csv")), /Malformed Forecast Wide preview/,
    "Forecast Preview rejects negative composition amounts");

  runtime.fetch = async () => new Response(JSON.stringify({
    etag: "cm-blocked", sources: [{ fileName: "forecast.csv", sha256: "b".repeat(64) }], lines: [], populatedCellCount: 0,
    canonicalPeriods: ["FY27-SEP", "FY27-OCT"],
    blockedErrors: [{ sourceRow: 4, column: "FY27-NOV", code: "PERIOD_NOT_EDITABLE", message: "FY27-NOV is outside the editable window." }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const blockedPreview = await previewConsumptionForecastWide(new File(["csv"], "forecast.csv"));
  assert.deepEqual(blockedPreview.blockedErrors, [{ rowNumber: 4, column: "FY27-NOV", code: "PERIOD_NOT_EDITABLE", message: "FY27-NOV is outside the editable window." }]);
  assert.equal(blockedPreview.hasBlockedErrors, true, "backend blocking errors prevent applying an invalid Forecast import");

  delete runtime.__KPI_API_BASE_URL__;
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: { hostname: "127.0.0.1" } });
  assert.equal(canUseConsumptionFallback(new ConsumptionNetworkError(new Error("offline"))), true);
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: { hostname: "production.example" } });
  assert.equal(canUseConsumptionFallback(new ConsumptionNetworkError(new Error("offline"))), false);
  console.log("consumptionApi tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
