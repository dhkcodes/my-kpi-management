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
  assert.deepEqual(result, {
    fiscalYear: "FY26",
    quarters: [
      { quarter: "Q1", budget: 100, actual: 90, forecast: 110, dpActual: 40, dpForecast: 50, ociActual: 50, ociForecast: 60, actualAttainment: 90, forecastAttainment: 110 },
      { quarter: "Q2", budget: 0, actual: 0, forecast: 10, dpActual: 0, dpForecast: 4, ociActual: 0, ociForecast: 6, actualAttainment: null, forecastAttainment: null },
      { quarter: "Q3", budget: null, actual: 20, forecast: 30, dpActual: 8, dpForecast: 12, ociActual: 12, ociForecast: 18, actualAttainment: null, forecastAttainment: null },
      { quarter: "Q4", budget: 200, actual: 150, forecast: 250, dpActual: 70, dpForecast: 100, ociActual: 80, ociForecast: 150, actualAttainment: 75, forecastAttainment: 125 }
    ],
    summary: { budget: null, actual: 260, forecast: 400, dpActual: 118, dpForecast: 166, ociActual: 142, ociForecast: 234, actualAttainment: null, forecastAttainment: null, actualVarianceToBudget: null, forecastVarianceToBudget: null }
  });

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
