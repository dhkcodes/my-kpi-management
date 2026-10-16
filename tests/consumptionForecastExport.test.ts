import assert from "node:assert/strict";
import { ConsumptionApiError, ConsumptionNetworkError, exportConsumptionForecastXlsx } from "../src/data/consumptionApi";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const query = { pillar: "DP" as const, fromQuarter: "FY27-Q2", toQuarter: "FY28-Q3", salesRep: "Rep A & B", search: "Acme + Lab" };
// Transport fixture only: workbook rendering/reimport remains the server's responsibility.
const bytes = new Uint8Array([80, 75, 3, 4, 0, 1]);
let calls = 0;
void (async () => {
  runtime.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/v1/consumption/exports/forecast-xlsx");
    assert.equal(init?.method, "GET");
    assert.deepEqual(Object.fromEntries(url.searchParams), query);
    assert.equal(url.searchParams.has("offset"), false, "export must not inherit screen pagination");
    return new Response(bytes, { headers: { "Content-Type": mime } });
  };
  const exported = await exportConsumptionForecastXlsx(query);
  assert.deepEqual(new Uint8Array(await exported.blob.arrayBuffer()), bytes, "preserve the import-compatible server workbook bytes");
  assert.equal(exported.fileName, "OCI Consumption Forecast FY27-FY28.xlsx");
  assert.doesNotMatch(exported.fileName, /Q[1-4]/);
  const beforeInvalid = calls;
  for (const invalid of [{ ...query, fromQuarter: "FY27-Q5" }, { ...query, fromQuarter: "FY29-Q1" },
    { ...query, fiscalYear: "2027" }, { ...query, pillar: "INVALID" as "DP" }]) {
    await assert.rejects(() => exportConsumptionForecastXlsx(invalid), /Invalid Consumption/);
  }
  assert.equal(calls, beforeInvalid, "reject invalid filters before issuing a request");
  runtime.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("fiscalYear"), "FY27");
    assert.equal(url.searchParams.get("pillar"), "OCI");
    return new Response(bytes, { headers: { "Content-Type": mime } });
  };
  assert.equal((await exportConsumptionForecastXlsx({ pillar: "OCI", fiscalYear: "FY27" })).fileName,
    "OCI Consumption Forecast FY27.xlsx");
  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/exports/forecast-xlsx?pillar=ALL");
    return new Response(bytes, { headers: { "Content-Type": mime,
      "Content-Disposition": "attachment; filename*=UTF-8''Forecast%20FY27.xlsx" } });
  };
  assert.equal((await exportConsumptionForecastXlsx("ALL")).fileName, "Forecast FY27.xlsx", "legacy caller and encoded server filenames stay supported");
  runtime.fetch = async () => new Response("not xlsx", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(() => exportConsumptionForecastXlsx(query), /Malformed/);
  runtime.fetch = async () => new Response(null, { headers: { "Content-Type": mime } });
  await assert.rejects(() => exportConsumptionForecastXlsx(query), /Malformed/);
  runtime.fetch = async () => new Response(JSON.stringify({ code: "FORBIDDEN", message: "Denied" }), { status: 403 });
  await assert.rejects(() => exportConsumptionForecastXlsx(query), ConsumptionApiError);
  runtime.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(() => exportConsumptionForecastXlsx(query), ConsumptionNetworkError);
  console.log("Forecast XLSX filtered transport tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
