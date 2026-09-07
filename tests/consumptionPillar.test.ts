import assert from "node:assert/strict";
import {
  applyConsumptionImport,
  exportConsumptionImportCompatibleCsv,
  fetchConsumptionAnalysis,
  fetchConsumptionRecords,
  fetchConsumptionWorkspace,
  previewConsumptionImport
} from "../src/data/consumptionApi";
import { consumptionPillarOptions, formatConsumptionDataCenter } from "../src/data/consumptionData";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string; fetch: typeof fetch };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";

const workspace = {
  selectedPillar: "DP",
  availablePillars: ["ALL", "DP", "OCI_OTHER"], aggregationGrain: "PLAN_PERIOD",
  etag: '"pillar"', lastBatchId: null,
  currentFiscalMonth: "FY27-AUG", fromQuarter: "FY27-Q1", toQuarter: "FY27-Q1",
  editablePeriodIds: ["FY27-SEP", "FY27-OCT", "FY27-NOV"], displayQuarterOrder: ["FY27-Q2", "FY27-Q1"],
  plans: [{ planId: 1, stableKey: "A::P1", account: "A", endUser: "EU", planCode: "P1", dataCenter: "3", dpDataCenterCount: 3, ociOtherDataCenterCount: 2,
    dataCenterBreakdown: { dpCount: 3, ociOtherCount: 2, duplicatePossible: true },
    facts: [{ periodKey: "FY27-AUG", actualAmount: 100, forecastAmount: null, versionNo: 1, pillar: "DP" }] }],
  controlTotals: [], signals: []
};

const analysis = {
  selectedPillar: "OCI_OTHER", fiscalYear: "FY27", priorFiscalYear: "FY26", selectedAccount: null,
  portfolio: { actualAmount: 0, forecastAmount: 0, totalAmount: 0, status: "INCOMPLETE", coveragePercent: 0,
    priorActualAmount: 0, priorForecastAmount: 0, priorTotalAmount: 0, priorStatus: "INCOMPLETE", priorCoveragePercent: 0 },
  quarters: ["Q1", "Q2", "Q3", "Q4"].map((quarter) => ({ quarter, actualAmount: 0, forecastAmount: 0,
    totalAmount: 0, status: "INCOMPLETE", coveragePercent: 0, qoqChangeAmount: null, qoqChangePercent: null })),
  accountCandidates: [], contextActualTrend: [], otherContribution: null,
  otherContributionUnavailableReason: null, alerts: [], accounts: []
};

void (async () => {
  assert.deepEqual(consumptionPillarOptions, [
    { label: "All", value: "ALL" }, { label: "DP", value: "DP" }, { label: "OCI/Other", value: "OCI_OTHER" }
  ]);
  assert.deepEqual(formatConsumptionDataCenter(workspace.plans[0], "ALL"), {
    primary: "5", detail: "DP 3 + OCI/Other 2", duplicateWarning: "Duplicate possible across pillars"
  });
  assert.deepEqual(formatConsumptionDataCenter(workspace.plans[0], "DP"), { primary: "3", detail: null, duplicateWarning: null });

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/workspace?fromQuarter=FY27-Q1&toQuarter=FY27-Q1&pillar=DP");
    return new Response(JSON.stringify(workspace), { status: 200, headers: { "Content-Type": "application/json", ETag: '"pillar"' } });
  };
  const decodedWorkspace = await fetchConsumptionWorkspace({ fromQuarter: "FY27-Q1", toQuarter: "FY27-Q1" }, "DP");
  assert.equal(decodedWorkspace.selectedPillar, "DP");
  assert.deepEqual(decodedWorkspace.plans[0].dataCenterBreakdown, workspace.plans[0].dataCenterBreakdown);

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/records?fromQuarter=&toQuarter=&search=&sort=ACCOUNT&direction=ASC&offset=0&limit=10&pillar=DP");
    return new Response(JSON.stringify({ ...workspace, accountGroups: [{ account: "A", plans: workspace.plans }],
      totalAccounts: 1, nextOffset: 1, hasMore: false }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const records = await fetchConsumptionRecords({ fromQuarter: "", toQuarter: "", search: "", sort: "ACCOUNT", direction: "ASC", offset: 0, limit: 10, pillar: "DP" });
  assert.equal(records.selectedPillar, "DP");

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/analysis?fiscalYear=FY27&search=&account=&pillar=OCI_OTHER");
    return new Response(JSON.stringify(analysis), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const decodedAnalysis = await fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "", pillar: "OCI_OTHER" });
  assert.equal(decodedAnalysis.selectedPillar, "OCI_OTHER");

  const files = [new File(["a"], "dp.csv", { type: "text/csv" }), new File(["b"], "oci.csv", { type: "text/csv" })];
  const previewPayload = {
    files: [
      { sourceFileName: "dp.csv", sourceOwner: "owner-a", sourcePeriodFrom: "FY27-JUN", sourcePeriodTo: "FY27-AUG", pillar: "DP", sourceSha256: "a".repeat(64), plans: [{}], controlTotals: [], sourceRowCount: 1 },
      { sourceFileName: "oci.csv", sourceOwner: "owner-a", sourcePeriodFrom: "FY27-JUN", sourcePeriodTo: "FY27-AUG", pillar: "OCI_OTHER", sourceSha256: "b".repeat(64), plans: [{}], controlTotals: [], sourceRowCount: 1 }
    ],
    physicalFactCount: 1,
    deduplicatedFactCount: 1,
    conflicts: []
  };
  runtime.fetch = async (input, init) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/imports/preview?pillar=ALL");
    assert.equal(init?.method, "POST");
    assert.ok(init?.body instanceof FormData);
    assert.deepEqual((init.body as FormData).getAll("files").map((file) => (file as File).name), ["dp.csv", "oci.csv"]);
    assert.equal(new Headers(init.headers).has("Content-Type"), false, "browser must own the multipart boundary");
    return new Response(JSON.stringify(previewPayload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const preview = await previewConsumptionImport(files, "ALL");
  assert.equal(preview.files[1].detectedPillar, "OCI_OTHER");
  assert.equal(preview.sameValueDuplicateCount, 1);
  assert.equal(preview.hasConflicts, false);

  await assert.rejects(() => previewConsumptionImport([], "ALL"), /1 to 8 CSV files/);
  await assert.rejects(() => previewConsumptionImport(Array.from({ length: 9 }, (_, index) => new File(["x"], `${index}.csv`)), "ALL"), /1 to 8 CSV files/);

  runtime.fetch = async (input, init) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/imports/apply?pillar=ALL");
    assert.ok(init?.body instanceof FormData);
    return new Response(JSON.stringify({ workspace: { ...workspace, selectedPillar: "ALL", plans: [{ ...workspace.plans[0], dataCenter: "5", facts: workspace.plans[0].facts.map((fact) => ({ ...fact, pillar: "ALL" })) }] },
      batchIds: [1, 2], duplicate: false, physicalFactCount: 1, deduplicatedFactCount: 1 }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const applied = await applyConsumptionImport(files, "ALL");
  assert.deepEqual([applied.physicalFactCount, applied.deduplicatedFactCount, applied.duplicate], [1, 1, false]);

  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/exports/import-compatible?pillar=OCI_OTHER");
    return new Response("Customer\n", { status: 200, headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="oci.csv"' } });
  };
  assert.equal((await exportConsumptionImportCompatibleCsv("OCI_OTHER")).fileName, "oci.csv");

  runtime.fetch = async () => new Response(JSON.stringify({ ...workspace, selectedPillar: "ALL" }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => fetchConsumptionWorkspace(undefined, "DP"), /Malformed Consumption workspace pillar/);
  runtime.fetch = async () => new Response(JSON.stringify({ ...workspace, plans: [{ ...workspace.plans[0], dataCenterBreakdown: { dpCount: -1, ociOtherCount: 2, duplicatePossible: false } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => fetchConsumptionWorkspace(undefined, "DP"), /Malformed Consumption plan response/);
  runtime.fetch = async () => new Response(JSON.stringify({ ...analysis, selectedPillar: "DP" }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => fetchConsumptionAnalysis({ fiscalYear: "FY27", search: "", account: "", pillar: "OCI_OTHER" }), /Malformed Consumption analysis/);

  console.log("consumptionPillar tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
