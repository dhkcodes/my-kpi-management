import assert from "node:assert/strict";
import {
  fetchFxRate,
  fetchKpiGuides,
  FxRateRecord,
  KpiGuideRecord,
  updateFxRate,
  updateKpiGuide
} from "../src/data/kpiConfigurationApi";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" }
});

const guide: KpiGuideRecord = {
  kpiGuideId: 7,
  fiscalYear: "FY27",
  kpiCode: "A",
  srType: "Independent SR",
  businessSrType: "Business Planning",
  combinedSrType: null,
  targetPerQuarter: "1 / Quarter",
  activity: "Workshop",
  taskType: "Delivery",
  measuring: "# Sessions",
  details: "Authoritative details",
  notes: "Server notes",
  versionNo: 3
};

const fx: FxRateRecord = {
  fxRateId: 9,
  fiscalYear: "FY27",
  fromCurrency: "USD",
  toCurrency: "KRW",
  rateValue: 1380.5,
  sourceReference: "Finance",
  versionNo: 4
};

async function run() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).includes("kpi-guides")) return response(init?.method === "PUT" ? { ...guide, versionNo: 4, notes: "Saved by server" } : [guide]);
    return response(init?.method === "PUT" ? { ...fx, versionNo: 5, rateValue: 1400 } : fx);
  };

  const guides = await fetchKpiGuides("FY27", fetchImpl);
  assert.equal(calls[0].url, "/api/v1/kpi-guides?fiscalYear=FY27");
  assert.equal(guides[0].versionNo, 3);

  const savedGuide = await updateKpiGuide({ ...guide, notes: "client draft" }, fetchImpl);
  assert.equal(calls[1].url, "/api/v1/kpi-guides/A");
  assert.equal(calls[1].init?.method, "PUT");
  const guideBody = JSON.parse(String(calls[1].init?.body));
  assert.equal(guideBody.kpiGuideId, undefined);
  assert.equal(guideBody.fiscalYear, "FY27");
  assert.equal(guideBody.versionNo, 3);
  assert.equal(savedGuide.notes, "Saved by server", "authoritative mutation response wins");

  const loadedFx = await fetchFxRate("FY27", fetchImpl);
  assert.equal(calls[2].url, "/api/v1/fx-rates?fiscalYear=FY27&fromCurrency=USD&toCurrency=KRW");
  assert.equal(loadedFx.rateValue, 1380.5);

  const savedFx = await updateFxRate({ ...fx, rateValue: 1390 }, fetchImpl);
  assert.equal(calls[3].url, "/api/v1/fx-rates/9");
  assert.deepEqual(JSON.parse(String(calls[3].init?.body)), { versionNo: 4, rateValue: 1390 });
  assert.equal(savedFx.rateValue, 1400, "authoritative FX response wins");
  assert.equal(savedFx.versionNo, 5);

  await assert.rejects(
    () => fetchKpiGuides("FY27", async () => response({ items: [{ ...guide, versionNo: 0 }] })),
    /Malformed KPI Guide API response/
  );
  await assert.rejects(
    () => fetchFxRate("FY27", async () => response({ ...fx, rateValue: -1 })),
    /Malformed FX Rate API response/
  );
  await assert.rejects(
    () => updateKpiGuide({ ...guide }, async () => response({ ...guide, notes: 12 })),
    /Malformed KPI Guide API response/
  );

  console.log("kpiConfigurationApi tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
