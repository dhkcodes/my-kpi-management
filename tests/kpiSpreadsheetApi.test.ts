import assert from "node:assert/strict";
import { decodeKpiOverview, decodeKpiRows, decodeKpiSummary, deleteKpiRow, getKpiActivitiesApiBase, listKpiOverview, listKpiRows, listKpiSummary, listKpiWorkloadOptions, saveKpiRow, saveKpiRowsAtomic } from "../src/data/kpiSpreadsheetApi";
import { KpiSpreadsheetRow } from "../src/data/kpiSpreadsheet";
import { buildLiveFiscalYearDataset } from "../src/data/kpiLiveDashboard";
import { fiscalYearData } from "../src/data/kpiMockData";

const backend = {
  id: 41, versionNo: 2, manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "A",
  deliveryDate: "2026-07-15", deliveryDateRaw: null, quarter: "Q1", activityMonth: null,
  rawWorkload: null, mappingStatus: "NOT_REQUIRED", salesStage: null, acrK: null,
  targetQuarter: null, srNumber: "SYN-2001", description: "Awareness session"
};
const valid: KpiSpreadsheetRow = {
  id: "41", versionNo: 2, manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "A", quarter: "Q1", month: "",
  accountWorkload: "", workloadId: null, mappingStatus: "NOT_REQUIRED", title: "Awareness session", srNumber: "SYN-2001",
  stage: "", acrK: null, targetQuarter: "", deliveryDate: "2026-07-15"
};
assert.deepEqual(decodeKpiRows({ items: [backend] }), [valid]);
assert.throws(() => decodeKpiRows({ items: [{ ...backend, kpiCode: "G" }] }), /Invalid KPI code/);
assert.equal(
  getKpiActivitiesApiBase({ location: { protocol: "http:", hostname: "127.0.0.1", port: "8000" } }),
  "/api/v1/kpi-activities"
);
assert.equal(
  getKpiActivitiesApiBase({ location: { protocol: "https:", hostname: "127.0.0.1", port: "8000" } }),
  "/api/v1/kpi-activities"
);
assert.equal(
  getKpiActivitiesApiBase({ location: { protocol: "https:", hostname: "hermes-one-server.tail57dd1d.ts.net", port: "8443" } }),
  "/api/v1/kpi-activities"
);

const overviewPayload = {
  fiscalYear: "FY27",
  asOf: "2026-08-17",
  items: [
    { code: "C1", rows: 3, target: "C1 + C2 combined · 6 / Quarter", status: "Achieved", explanation: "Target reached" },
    { code: "C2", rows: 3, target: "C1 + C2 combined · 6 / Quarter", status: "Achieved", explanation: "Target reached" }
  ]
};
assert.equal(decodeKpiOverview(overviewPayload).items[0].status, "Achieved");
assert.throws(() => decodeKpiOverview({ ...overviewPayload, items: [{ ...overviewPayload.items[0], status: "Unknown" }] }), /Invalid KPI overview/);

const summaryPayload = {
  fiscalYear: "FY27",
  quarterCounts: {
    A: { Q1: 1, Q2: 0, Q3: 0, Q4: 0 }, B: { Q1: 4, Q2: 0, Q3: 0, Q4: 0 },
    C1: { Q1: 2, Q2: 0, Q3: 0, Q4: 0 }, C2: { Q1: 3, Q2: 0, Q3: 0, Q4: 0 },
    D1: { Q1: 1, Q2: 0, Q3: 0, Q4: 0 }, F: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }, H: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }
  },
  c1C2Monthly: {
    Q1: { C1: { "2026-06": 1, "2026-07": 1 }, C2: { "2026-06": 1, "2026-07": 1, "2026-08": 1 } },
    Q2: { C1: {}, C2: {} }, Q3: { C1: {}, C2: {} }, Q4: { C1: {}, C2: {} }
  },
  d1QuarterByStage: {
    Q1: { IDENTIFIED: { count: 1, acrK: 2100 }, VALIDATED: { count: 0, acrK: 0 }, ONBOARDED: { count: 0, acrK: 0 } },
    Q2: { IDENTIFIED: { count: 0, acrK: 0 }, VALIDATED: { count: 0, acrK: 0 }, ONBOARDED: { count: 0, acrK: 0 } },
    Q3: { IDENTIFIED: { count: 0, acrK: 0 }, VALIDATED: { count: 0, acrK: 0 }, ONBOARDED: { count: 0, acrK: 0 } },
    Q4: { IDENTIFIED: { count: 0, acrK: 0 }, VALIDATED: { count: 0, acrK: 0 }, ONBOARDED: { count: 0, acrK: 0 } }
  },
  targets: {
    countPerQuarter: { A: 1, B: 12, F: 1, H: 1 },
    c1C2CombinedPerQuarter: 6,
    d1AcrKPerQuarter: { IDENTIFIED: 2000, VALIDATED: 1000, ONBOARDED: 500 },
    labels: { A: "1 / Quarter", B: "12 / Quarter", C1: "C1 + C2 combined · 6 / Quarter", C2: "C1 + C2 combined · 6 / Quarter", D1: "Onboarded 500K · Validated 1,000K · Identified 2,000K / Quarter", F: "1 / Quarter", H: "1 / Quarter" }
  }
};
assert.equal(decodeKpiSummary(summaryPayload).targets.countPerQuarter.B, 12);
assert.equal(decodeKpiSummary(summaryPayload).d1QuarterByStage.Q1.IDENTIFIED.acrK, 2100);
const liveDataset = buildLiveFiscalYearDataset(decodeKpiSummary(summaryPayload), fiscalYearData.FY27);
assert.equal(liveDataset.sourceWorkbook, "KPI Activities API · Reflected Delivery Date statistics");
assert.equal(liveDataset.overviewRows.find((row) => row.code === "B")?.quarters[0].target, 12);
assert.equal(liveDataset.overviewRows.find((row) => row.code === "C1+C2")?.quarters[0].actual, 5);
assert.equal(liveDataset.newWorkload[0].metrics.find((metric) => metric.stage === "identified")?.actualK, 2100);
assert.throws(() => decodeKpiSummary({ ...summaryPayload, targets: { ...summaryPayload.targets, countPerQuarter: { ...summaryPayload.targets.countPerQuarter, B: 12.5 } } }), /Invalid KPI summary/);
assert.throws(() => decodeKpiSummary({ ...summaryPayload, quarterCounts: { ...summaryPayload.quarterCounts, A: { ...summaryPayload.quarterCounts.A, Q1: -1 } } }), /Invalid KPI summary/);
assert.throws(() => decodeKpiSummary({ ...summaryPayload, d1QuarterByStage: { ...summaryPayload.d1QuarterByStage, Q1: { ...summaryPayload.d1QuarterByStage.Q1, IDENTIFIED: { count: 1, acrK: Number.NaN } } } }), /Invalid KPI summary/);

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), init });
  const responseBody = String(input).endsWith("/batch")
    ? { items: [backend, { ...backend, id: 42 }] }
    : String(input).includes("/summary")
    ? summaryPayload
    : String(input).includes("/overview")
    ? overviewPayload
    : String(input).includes("workload-options")
      ? { items: [{ workloadId: 17, accountName: "Account A", workloadName: "Workload A", opptyNo: "D100" }], total: 1, hasMore: false }
      : null;
  return new Response(JSON.stringify(init?.method === "DELETE" ? undefined : responseBody ?? (init?.method ? backend : { items: [backend] })), {
    status: init?.method === "DELETE" ? 204 : init?.method === "POST" ? 201 : 200,
    headers: { "Content-Type": "application/json" }
  });
};

async function run() {
  await listKpiRows("FY27", fetchImpl);
  const overview = await listKpiOverview("FY27", fetchImpl);
  assert.equal(overview.items[1].rows, 3);
  const summary = await listKpiSummary("FY27", fetchImpl);
  assert.equal(summary.targets.labels.B, "12 / Quarter");
  const options = await listKpiWorkloadOptions("FY27", "Account", 0, fetchImpl);
  assert.equal(options.items[0].workloadId, 17);
  await saveKpiRow(valid, fetchImpl);
  await saveKpiRow({ ...valid, id: "draft-a-1", versionNo: undefined }, fetchImpl);
  const batch = await saveKpiRowsAtomic([valid, { ...valid, id: "draft-a-2", versionNo: undefined }], fetchImpl);
  assert.equal(batch.length, 2);
  await deleteKpiRow(valid, fetchImpl);
  assert.equal(calls[0].url, "/api/v1/kpi-activities?fiscalYear=FY27");
  assert.equal(new Headers(calls[0].init?.headers).has("Content-Type"), false, "GET must not add a JSON content type");
  assert.equal(calls[1].url, "/api/v1/kpi-activities/overview?fiscalYear=FY27");
  assert.equal(calls[2].url, "/api/v1/kpi-activities/summary?fiscalYear=FY27");
  assert.match(calls[3].url, /workload-options\?fiscalYear=FY27&search=Account&offset=0&size=10$/);
  assert.equal(calls[4].init?.method, "PATCH");
  assert.equal(calls[5].init?.method, "POST");
  assert.equal(calls[6].url, "/api/v1/kpi-activities/batch");
  assert.equal(calls[6].init?.method, "POST");
  const batchBody = JSON.parse(String(calls[6].init?.body));
  assert.equal(batchBody.items[0].id, 41);
  assert.equal(batchBody.items[0].versionNo, 2);
  assert.equal(batchBody.items[1].id, undefined);
  assert.match(calls[7].url, /versionNo=2$/);
  assert.equal(calls[7].init?.method, "DELETE");
  assert.equal(new Headers(calls[7].init?.headers).has("Content-Type"), false, "DELETE must not add a JSON content type");
  console.log("kpiSpreadsheetApi tests passed");
}

void run();
