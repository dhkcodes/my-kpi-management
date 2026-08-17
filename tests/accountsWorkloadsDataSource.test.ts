import assert from "node:assert/strict";
import {
  createApiAccountWorkloadMetadata,
  loadAccountWorkloadStateSeed,
  normalizeAccountWorkloadStateSeed
} from "../src/data/accountsWorkloadsDataSource";

const fixture = {
  schemaVersion: 1,
  metadata: {
    fiscalYear: "FY27" as const,
    sourceWorkbook: "private-fy27.xlsx",
    sourceSheet: "Deal Status" as const,
    headerRowNumber: 2,
    exchangeRate: 1506.1,
    currencyPair: "USD_KRW" as const,
    parsedRowCount: 1
  },
  rows: [{
    id: "fy27-aw-safe-test",
    sourceRowNumber: 3,
    planNumber: " UCM TEST ",
    account: " Test Account ",
    workloadName: " Test Workload ",
    opptyNo: " TEST01 ",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    arrUsd: 100,
    arrKrw: 150610,
    acrUsd: null,
    acrKrw: null,
    target: "FY27 Q1",
    winProbability: 100,
    latestUpdate: " Ready ",
    notes: "",
    isImportant: false,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null
  }]
};

async function run() {
  const normalized = normalizeAccountWorkloadStateSeed(fixture);
  assert.equal(normalized.metadata.exchangeRate, 1506.1);
  assert.equal(normalized.metadata.parsedRowCount, 1);
  assert.equal(normalized.rows[0].account, "Test Account");
  assert.equal(normalized.rows[0].planNumber, "UCM TEST");
  assert.equal(normalized.rows[0].latestUpdate, "Ready");
  assert.notEqual(normalized.rows, fixture.rows, "normalization must return a defensive row collection");
  assert.throws(
    () => normalizeAccountWorkloadStateSeed({ ...fixture, rows: [{ ...fixture.rows[0], account: "" }] }),
    /account/i
  );
  assert.throws(
    () => normalizeAccountWorkloadStateSeed({ ...fixture, metadata: { ...fixture.metadata, parsedRowCount: 2 } }),
    /row count/i
  );

  const fy26ApiMetadata = createApiAccountWorkloadMetadata("FY26", 3, fixture.metadata);
  assert.equal(fy26ApiMetadata.fiscalYear, "FY26", "API metadata must describe the requested fiscal year");
  assert.equal(fy26ApiMetadata.parsedRowCount, 3, "API metadata must describe the loaded row collection");
  assert.equal(fy26ApiMetadata.sourceWorkbook, "Accounts & Workloads API");

  const fy28ApiMetadata = createApiAccountWorkloadMetadata("FY28", 0, fixture.metadata);
  assert.equal(fy28ApiMetadata.fiscalYear, "FY28");
  assert.equal(fy28ApiMetadata.parsedRowCount, 0);

  const unavailable = await loadAccountWorkloadStateSeed(async () => new Response(null, { status: 404 }));
  assert.equal(unavailable.source, "synthetic-fallback", "a missing development payload may use the synthetic fallback");
  await assert.rejects(
    () => loadAccountWorkloadStateSeed(async () => new Response(null, { status: 500 })),
    /500/,
    "server failures must be visible instead of silently falling back"
  );
  await assert.rejects(
    () => loadAccountWorkloadStateSeed(async () => new Response(JSON.stringify({ broken: true }), { status: 200 })),
    /invalid/i,
    "malformed private data must be visible instead of silently falling back"
  );

  console.log("accountsWorkloadsDataSource tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
