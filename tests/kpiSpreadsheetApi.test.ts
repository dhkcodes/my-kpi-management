import assert from "node:assert/strict";
import { decodeKpiRows, deleteKpiRow, getKpiActivitiesApiBase, listKpiRows, saveKpiRow } from "../src/data/kpiSpreadsheetApi";
import { KpiSpreadsheetRow } from "../src/data/kpiSpreadsheet";

const backend = {
  id: 41, versionNo: 2, manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "A",
  deliveryDate: "2026-07-15", deliveryDateRaw: null, quarter: "Q1", activityMonth: null,
  rawWorkload: null, mappingStatus: "NOT_REQUIRED", salesStage: null, acrK: null,
  targetQuarter: null, srNumber: "SYN-2001", description: "Awareness session"
};
const valid: KpiSpreadsheetRow = {
  id: "41", versionNo: 2, manageTimeReflected: false, fiscalYear: "FY27", kpiCode: "A", quarter: "Q1", month: "",
  accountWorkload: "", title: "Awareness session", srNumber: "SYN-2001",
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

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), init });
  return new Response(JSON.stringify(init?.method === "DELETE" ? undefined : init?.method ? backend : { items: [backend] }), {
    status: init?.method === "DELETE" ? 204 : init?.method === "POST" ? 201 : 200,
    headers: { "Content-Type": "application/json" }
  });
};

async function run() {
  await listKpiRows("FY27", fetchImpl);
  await saveKpiRow(valid, fetchImpl);
  await saveKpiRow({ ...valid, id: "draft-a-1", versionNo: undefined }, fetchImpl);
  await deleteKpiRow(valid, fetchImpl);
  assert.equal(calls[0].url, "/api/v1/kpi-activities?fiscalYear=FY27");
  assert.equal(new Headers(calls[0].init?.headers).has("Content-Type"), false, "GET must not add a JSON content type");
  assert.equal(calls[1].init?.method, "PATCH");
  assert.equal(calls[2].init?.method, "POST");
  assert.match(calls[3].url, /versionNo=2$/);
  assert.equal(calls[3].init?.method, "DELETE");
  assert.equal(new Headers(calls[3].init?.headers).has("Content-Type"), false, "DELETE must not add a JSON content type");
  console.log("kpiSpreadsheetApi tests passed");
}

void run();
