import assert from "node:assert/strict";
import { fetchAttainment, updateAttainmentBudget } from "../src/data/attainmentApi";

void (async () => {
  const payload = {
    fiscalYear: "FY26",
    quarters: [
      { quarter: "Q1", budget: 100, actual: 90, forecast: 110, dp: { actual: 40, forecast: 50 }, oci: { actual: 50, forecast: 60 }, actualAttainment: 90, forecastAttainment: 110 },
      { quarter: "Q2", budget: 0, actual: 0, forecast: 10, dp: { actual: 0, forecast: 4 }, oci: { actual: 0, forecast: 6 }, actualAttainment: null, forecastAttainment: null },
      { quarter: "Q3", budget: null, actual: 20, forecast: 30, dp: { actual: 8, forecast: 12 }, oci: { actual: 12, forecast: 18 }, actualAttainment: null, forecastAttainment: null },
      { quarter: "Q4", budget: 200, actual: 150, forecast: 250, dp: { actual: 70, forecast: 100 }, oci: { actual: 80, forecast: 150 }, actualAttainment: 75, forecastAttainment: 125 }
    ],
    fiscalYearSummary: { budget: null, actual: 260, forecast: 400, dp: { actual: 118, forecast: 166 }, oci: { actual: 142, forecast: 234 }, actualAttainment: null, forecastAttainment: null, actualVarianceToBudget: null, forecastVarianceToBudget: null }
  };

  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input); capturedInit = init;
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await fetchAttainment("FY26", fetchImpl);
  assert.equal(capturedUrl, "/api/v1/attainment?fiscalYear=FY26");
  assert.equal(capturedInit?.credentials, "include", "Attainment GET uses shared authenticated fetch behavior");
  assert.equal(result.fiscalYear, "FY26");
  assert.equal(result.quarters.length, 4);
  assert.equal(result.quarters[0].quarter, "Q1");
  assert.equal(result.quarters[0].actual, 90);
  assert.equal(result.quarters[0].outlook, 110, "legacy responses map Forecast to Outlook");
  assert.equal(result.quarters[0].dpOutlook, 50);
  assert.deepEqual(result.quarters[0].details, []);
  assert.equal(result.summary.actual, 260);
  assert.equal(result.summary.outlook, 400);
  assert.equal(result.summary.outlookVarianceToBudget, null);

  const incompletePayload = {
    ...payload,
    quarters: payload.quarters.map((quarter, index) => index === 0 ? {
      ...quarter,
      outlook: null,
      outlookAttainment: null,
      dp: { ...quarter.dp, outlook: null },
      oci: { ...quarter.oci, outlook: null },
      details: [{
        account: "Missing Actual Account",
        pillar: "DP",
        months: [{ periodKey: "FY26-JUN", month: "JUN", actual: null, forecast: 10, appliedAmount: null, appliedSource: "NONE" }],
        quarterTotal: null
      }]
    } : quarter),
    fiscalYearSummary: {
      ...payload.fiscalYearSummary,
      outlook: null,
      outlookAttainment: null,
      outlookVarianceToBudget: null,
      dp: { ...payload.fiscalYearSummary.dp, outlook: null },
      oci: { ...payload.fiscalYearSummary.oci, outlook: null }
    }
  };
  const incompleteFetch = async () => new Response(JSON.stringify(incompletePayload), { status: 200 });
  const incomplete = await fetchAttainment("FY26", incompleteFetch);
  assert.equal(incomplete.quarters[0].outlook, null, "missing closed-period Actual remains unknown");
  assert.equal(incomplete.quarters[0].details[0].quarterTotal, null);
  assert.equal(incomplete.summary.outlook, null);

  await updateAttainmentBudget("FY26", { q1: 100, q2: 0, q3: null, q4: 200.5 }, fetchImpl);
  assert.equal(capturedUrl, "/api/v1/attainment/budget?fiscalYear=FY26");
  assert.equal(capturedInit?.method, "PUT");
  assert.equal(capturedInit?.credentials, "include");
  assert.equal(new Headers(capturedInit?.headers).get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), { q1: 100, q2: 0, q3: null, q4: 200.5 });

  await assert.rejects(() => updateAttainmentBudget("FY26", { q1: -1, q2: null, q3: null, q4: null }, fetchImpl), /nonnegative/);
  await assert.rejects(() => fetchAttainment("2026", fetchImpl), /fiscal year/);

  const malformedFetch = async () => new Response(JSON.stringify({ ...payload, quarters: payload.quarters.slice(0, 3) }), { status: 200 });
  await assert.rejects(() => fetchAttainment("FY26", malformedFetch), /Malformed Attainment/);

  const wrongFiscalYearFetch = async () => new Response(JSON.stringify({ ...payload, fiscalYear: "FY27" }), { status: 200 });
  await assert.rejects(() => fetchAttainment("FY26", wrongFiscalYearFetch), /Malformed Attainment/);

  console.log("attainmentApi tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
