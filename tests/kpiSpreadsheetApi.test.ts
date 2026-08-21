import assert from "node:assert/strict";
import { decodeKpiOverview, decodeKpiRows, deleteKpiRow, getKpiActivitiesApiBase, listKpiOverview, listKpiRows, listKpiWorkloadOptions, saveKpiRow, saveKpiRowsAtomic } from "../src/data/kpiSpreadsheetApi";
import { KpiSpreadsheetRow } from "../src/data/kpiSpreadsheet";

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

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), init });
  const responseBody = String(input).endsWith("/batch")
    ? { items: [backend, { ...backend, id: 42 }] }
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
  assert.match(calls[2].url, /workload-options\?fiscalYear=FY27&search=Account&offset=0&size=10$/);
  assert.equal(calls[3].init?.method, "PATCH");
  assert.equal(calls[4].init?.method, "POST");
  assert.equal(calls[5].url, "/api/v1/kpi-activities/batch");
  assert.equal(calls[5].init?.method, "POST");
  const batchBody = JSON.parse(String(calls[5].init?.body));
  assert.equal(batchBody.items[0].id, 41);
  assert.equal(batchBody.items[0].versionNo, 2);
  assert.equal(batchBody.items[1].id, undefined);
  assert.match(calls[6].url, /versionNo=2$/);
  assert.equal(calls[6].init?.method, "DELETE");
  assert.equal(new Headers(calls[6].init?.headers).has("Content-Type"), false, "DELETE must not add a JSON content type");
  console.log("kpiSpreadsheetApi tests passed");
}

void run();
