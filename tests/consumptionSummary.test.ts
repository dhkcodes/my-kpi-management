import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchConsumptionSummary } from "../src/data/consumptionApi";

const runtime = globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string; fetch: typeof fetch };
runtime.__KPI_API_BASE_URL__ = "http://unit.test/api/v1";

const unavailable = (quarter: string) => ({ quarter, mode: "NO_DATA", actualAmount: null, forecastAmount: null,
  totalAmount: null, qoqPercent: null, qoqStatus: "NO_DATA" });

const payload = {
  currentQuarter: "FY27-Q2",
  showMtd: true,
  displayQuarterOrder: ["FY26-Q3", "FY26-Q4", "FY27-Q1", "FY27-Q2"],
  rows: [
    { label: "Total", pillar: "ALL", quarters: [
      { quarter: "FY26-Q3", mode: "FINAL_ACTUAL", actualAmount: "594120", forecastAmount: null, totalAmount: "594120", qoqPercent: "2.5", qoqStatus: "AVAILABLE" },
      unavailable("FY26-Q4"), unavailable("FY27-Q1"),
      { quarter: "FY27-Q2", mode: "MIXED", actualAmount: "280590", forecastAmount: "469299", totalAmount: "749889", qoqPercent: "7.8", qoqStatus: "AVAILABLE" }
    ] },
    { label: "OCI", pillar: "OCI", quarters: ["FY26-Q3", "FY26-Q4", "FY27-Q1", "FY27-Q2"].map(unavailable) },
    { label: "DP", pillar: "DP", quarters: ["FY26-Q3", "FY26-Q4", "FY27-Q1", "FY27-Q2"].map(unavailable) }
  ]
};

void (async () => {
  runtime.fetch = async (input) => {
    assert.equal(String(input), "http://unit.test/api/v1/consumption/records/summary?fromQuarter=FY26-Q3&toQuarter=FY27-Q2&search=acme&pillar=ALL&showMtd=true");
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const summary = await fetchConsumptionSummary({ fromQuarter: "FY26-Q3", toQuarter: "FY27-Q2", search: "acme", pillar: "ALL", showMtd: true });
  assert.deepEqual(summary.displayQuarterOrder, payload.displayQuarterOrder);
  assert.equal(summary.rows[0].label, "Total");
  assert.equal(summary.rows[0].quarters[3].totalAmountExact, "749889");
  assert.equal(summary.rows[0].quarters[3].qoqPercentExact, "7.8");

  runtime.fetch = async () => new Response(JSON.stringify({ ...payload, rows: [{ ...payload.rows[0], label: "ISV Total" }] }), { status: 200 });
  await assert.rejects(() => fetchConsumptionSummary({ fromQuarter: "FY26-Q3", toQuarter: "FY27-Q2", search: "", pillar: "ALL", showMtd: false }), /Malformed Consumption summary response/);

  const page = readFileSync(resolve(process.cwd(), "src/components/content/ConsumptionRecordsPage.tsx"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");
  assert.match(page, />Summary</, "Summary title must be concise");
  assert.match(page, /consumption-summary/, "Summary must have an isolated page-local class");
  assert.doesNotMatch(page, /ISV Total|ISV IaaS Only|ISV Data Platform/, "Summary row labels must be Total, OCI, and DP");
  const recordsFetch = page.indexOf("let page = await fetchConsumptionRecords({");
  const resolvedSummaryFetch = page.indexOf("fromQuarter: page.fromQuarter", recordsFetch);
  assert.ok(recordsFetch >= 0 && resolvedSummaryFetch > recordsFetch,
    "initial Summary must use the period range resolved by the authenticated Records response");
  assert.doesNotMatch(page.slice(0, recordsFetch), /loadConsumptionSummary\(requestQuery/,
    "Summary must not start with the initial empty Records query");
  assert.match(page, /summaryK[^\n]*formatExactKFixed\(value, 2\)/,
    "Summary amounts must use one fixed two-decimal K suffix");
  assert.doesNotMatch(page, /formatExactK\(value\)\}\s*K/,
    "Summary amounts must not append a second K suffix");
  assert.match(styles, /\.consumption-summary__scroll\s*\{[^}]*overflow-x:\s*auto/s,
    "long quarter ranges must scroll inside Summary only");

  console.log("consumption summary contract passed");
})();
