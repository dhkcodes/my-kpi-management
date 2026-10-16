import assert from "node:assert/strict";
import { ConsumptionApiError, ConsumptionNetworkError, exportConsumptionOpportunityReportXlsx } from "../src/data/consumptionApi";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Transport fixture only; server tests own workbook structure and real XLSX rendering.
const bytes = new Uint8Array([80, 75, 3, 4, 0, 1]);
void (async () => {
  runtime.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/v1/consumption/exports/opportunity-report-xlsx");
    assert.equal(url.search, "", "the report is independent of Records FY, quarter, rep, pillar, search and pagination");
    assert.equal(init?.method, "GET");
    return new Response(bytes, { headers: { "Content-Type": mime } });
  };
  const exported = await exportConsumptionOpportunityReportXlsx();
  assert.equal(exported.fileName, "Consumption_Opportunities.xlsx");
  assert.deepEqual(new Uint8Array(await exported.blob.arrayBuffer()), bytes);
  for (const disposition of [
    "attachment; filename=\"Synthetic Report.xlsx\"",
    "attachment; filename*=UTF-8''Synthetic%20Report.xlsx"
  ]) {
    runtime.fetch = async () => new Response(bytes, { headers: { "Content-Type": mime, "Content-Disposition": disposition } });
    assert.equal((await exportConsumptionOpportunityReportXlsx()).fileName, "Synthetic Report.xlsx");
  }
  runtime.fetch = async () => new Response("not xlsx", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(exportConsumptionOpportunityReportXlsx, /Malformed Consumption report/);
  runtime.fetch = async () => new Response(null, { headers: { "Content-Type": mime } });
  await assert.rejects(exportConsumptionOpportunityReportXlsx, /Malformed Consumption report/);
  for (const status of [401, 403, 500]) {
    runtime.fetch = async () => new Response(JSON.stringify({ code: "REPORT_DENIED", message: "Denied" }), { status });
    await assert.rejects(exportConsumptionOpportunityReportXlsx, (error: unknown) => {
      assert.ok(error instanceof ConsumptionApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, "REPORT_DENIED");
      return true;
    });
  }
  runtime.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(exportConsumptionOpportunityReportXlsx, ConsumptionNetworkError);
  console.log("Consumption opportunity report XLSX transport tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
