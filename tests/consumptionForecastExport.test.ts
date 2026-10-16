import assert from "node:assert/strict";
import { ConsumptionApiError, ConsumptionNetworkError, exportConsumptionForecastXlsx } from "../src/data/consumptionApi";
import type { ConsumptionForecastExportQuery } from "../src/data/consumptionApi";
import { getFiscalQuarter, getQuarterMonths, isConsumptionPeriodInQuarterRange } from "../src/data/consumptionData";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const query = { pillar: "DP" as const, fromQuarter: "FY27-Q2", toQuarter: "FY28-Q3", salesRep: "Rep A & B", search: "Acme + Lab" };
// Transport fixture only: workbook rendering/reimport remains the server's responsibility.
const bytes = new Uint8Array([80, 75, 3, 4, 0, 1]);
let calls = 0;
void (async () => {
  const filterCases: ReadonlyArray<readonly [string, ConsumptionForecastExportQuery, string]> = [
    ["unfiltered", { pillar: "ALL" }, "OCI Consumption Forecast.xlsx"],
    ["FY only", { pillar: "ALL", fiscalYear: "FY27" }, "OCI Consumption Forecast FY27.xlsx"],
    ["from only", { pillar: "ALL", fromQuarter: "FY27-Q3" }, "OCI Consumption Forecast FY27.xlsx"],
    ["to only", { pillar: "ALL", toQuarter: "FY28-Q3" }, "OCI Consumption Forecast FY28.xlsx"],
    ["rep only", { pillar: "ALL", salesRep: "Rep A & B" }, "OCI Consumption Forecast.xlsx"],
    ["DP only", { pillar: "DP" }, "OCI Consumption Forecast.xlsx"],
    ["OCI only", { pillar: "OCI" }, "OCI Consumption Forecast.xlsx"],
    ["search only", { pillar: "ALL", search: "Synthetic + Lab / 테스트" }, "OCI Consumption Forecast.xlsx"],
    ["combined Q3", { pillar: "DP", fiscalYear: "FY27", fromQuarter: "FY27-Q3", toQuarter: "FY27-Q3",
      salesRep: "Rep A & B", search: "Synthetic + Lab" }, "OCI Consumption Forecast FY27.xlsx"],
    ["combined multi FY", { pillar: "OCI", fiscalYear: "", fromQuarter: "FY26-Q4", toQuarter: "FY28-Q3",
      salesRep: "Rep C", search: "Synthetic" }, "OCI Consumption Forecast FY26-FY28.xlsx"],
    ["cleared filters", { pillar: "ALL", fiscalYear: "", fromQuarter: "", toQuarter: "", salesRep: "", search: "" },
      "OCI Consumption Forecast.xlsx"]
  ];
  for (const [label, filters, fileName] of filterCases) {
    let requests = 0;
    runtime.fetch = async (input, init) => {
      requests++;
      const url = new URL(String(input));
      assert.equal(url.pathname, "/api/v1/consumption/exports/forecast-xlsx", label);
      assert.equal(init?.method, "GET", label);
      assert.deepEqual(Object.fromEntries(url.searchParams), filters, `${label}: every filter round-trips without pagination or month truncation`);
      return new Response(bytes, { headers: { "Content-Type": mime } });
    };
    const result = await exportConsumptionForecastXlsx(filters);
    assert.equal(requests, 1, `${label}: one complete server workbook request`);
    assert.equal(result.fileName, fileName, label);
    assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), bytes, `${label}: preserve server workbook bytes`);
  }
  // FE fiscal-calendar semantics, not a claim to render/inspect the server workbook.
  for (const fiscalYear of ["FY26", "FY27", "FY28"]) {
    assert.deepEqual(getQuarterMonths(`${fiscalYear}-Q3`), [`${fiscalYear}-DEC`, `${fiscalYear}-JAN`, `${fiscalYear}-FEB`]);
    assert.equal(getFiscalQuarter(`${fiscalYear}-FEB`), `${fiscalYear}-Q3`);
    assert.equal(isConsumptionPeriodInQuarterRange(`${fiscalYear}-FEB`, `${fiscalYear}-Q3`, `${fiscalYear}-Q3`), true);
    assert.equal(isConsumptionPeriodInQuarterRange(`${fiscalYear}-MAR`, `${fiscalYear}-Q3`, `${fiscalYear}-Q3`), false);
  }
  assert.equal(isConsumptionPeriodInQuarterRange("FY27-FEB", "FY26-Q4", "FY28-Q3"), true);
  assert.equal(isConsumptionPeriodInQuarterRange("FY28-FEB", "FY26-Q4", "FY28-Q3"), true);
  assert.equal(isConsumptionPeriodInQuarterRange("FY28-MAR", "FY26-Q4", "FY28-Q3"), false);
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
