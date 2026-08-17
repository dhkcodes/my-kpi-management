import assert from "node:assert/strict";
import {
  buildAccountWorkloadPatch,
  createAccountWorkload,
  deleteAccountWorkload,
  fetchAccountsWorkloads,
  fetchAccountsWorkloadsSummary,
  patchAccountWorkload,
  permanentlyDeleteAccountWorkload,
  persistAccountWorkloadChanges,
  persistAndReconcileAccountWorkloadChanges,
  restoreAccountWorkload,
  saveAccountsWorkloadsBatch,
  AccountsWorkloadsPersistenceError,
  canUseDevelopmentDataFallback
} from "../src/data/accountsWorkloadsApi";
import { AccountWorkloadRow } from "../src/data/accountsWorkloadsMockData";

const saved: AccountWorkloadRow = {
  id: "41",
  commitmentId: 41,
  versionNo: 3,
  sourceRowNumber: 10,
  planNumber: "UCM 1",
  account: "Demo Account",
  workloadName: "Demo Workload",
  opptyNo: "D100",
  startDate: "2026-08-01",
  endDate: "2027-08-01",
  arrUsd: 100,
  arrKrw: 150000,
  acrUsd: 80,
  acrKrw: 120000,
  target: "FY27 Q2",
  winProbability: 50,
  latestUpdate: "Initial",
  notes: "",
  isImportant: false,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" }
});

async function run() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).includes("dashboard")) {
      return response({ activeAccounts: 2, activeWorkloads: 3, arrUsd: 100, acrUsd: 80, important: 1, targeted: 2 });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (init?.method === "POST" || init?.method === "PATCH") return response({ ...saved, versionNo: 4 });
    return response({ items: [saved], total: 1 });
  };

  const list = await fetchAccountsWorkloads({
    fiscalYear: "FY27",
    search: "Demo & Cloud",
    includeDeleted: true,
    sort: "account",
    direction: "desc"
  }, fetchImpl);
  assert.equal(list.items.length, 1);
  assert.equal(calls[0].url, "/api/v1/accounts-workloads?fiscalYear=FY27&search=Demo+%26+Cloud&includeDeleted=true&sort=account&direction=desc");

  const newRow = { ...saved, id: "new-atomic", commitmentId: undefined, versionNo: undefined, account: "Atomic New" };
  const deleted = { ...saved, isDeleted: true };
  const atomicCalls: Array<{ url: string; init?: RequestInit }> = [];
  const authoritativeFx = {
    fxRateId: 9,
    fiscalYear: "FY27" as const,
    fromCurrency: "USD" as const,
    toCurrency: "KRW" as const,
    rateValue: 1400,
    sourceReference: "Finance",
    versionNo: 5
  };
  const atomicResult = await saveAccountsWorkloadsBatch(
    [saved],
    [deleted, newRow],
    { fiscalYear: "FY27", search: "Demo & Cloud", includeDeleted: true, sort: "account", direction: "desc" },
    { ...authoritativeFx, rateValue: 1390, versionNo: 4 },
    async (input: RequestInfo | URL, init?: RequestInit) => {
      atomicCalls.push({ url: String(input), init });
      return response({ items: [{ ...saved, isDeleted: true, versionNo: 4 }], total: 1, fxRate: authoritativeFx });
    }
  );
  assert.equal(atomicCalls.length, 1, "all row and FX changes use one atomic request");
  assert.equal(atomicCalls[0].url, "/api/v1/accounts-workloads/save");
  assert.equal(atomicCalls[0].init?.method, "POST");
  const atomicBody = JSON.parse(String(atomicCalls[0].init?.body));
  assert.deepEqual(
    atomicBody.query,
    { fiscalYear: "FY27", search: "Demo & Cloud", includeDeleted: true, sort: "account", direction: "desc" },
    "the committed list query is preserved exactly as the backend typed query"
  );
  assert.equal(atomicBody.creates.length, 1);
  assert.equal(atomicBody.creates[0].account, "Atomic New");
  assert.deepEqual(atomicBody.patches, []);
  assert.deepEqual(atomicBody.deletes, [{ commitmentId: 41, versionNo: 3 }]);
  assert.deepEqual(atomicBody.restores, []);
  assert.deepEqual(atomicBody.permanentDeletes, []);
  assert.deepEqual(atomicBody.fxRate, { fxRateId: 9, versionNo: 4, rateValue: 1390 });
  assert.equal(atomicResult.items[0].versionNo, 4, "authoritative rows win");
  assert.equal(atomicResult.fxRate?.versionNo, 5, "authoritative FX/version wins");

  const rowOnlyResult = await saveAccountsWorkloadsBatch(
    [saved],
    [{ ...saved, notes: "row-only" }],
    { fiscalYear: "FY27" },
    undefined,
    async () => response({ items: [{ ...saved, notes: "row-only", versionNo: 4 }], total: 1, fxRate: null })
  );
  assert.equal(rowOnlyResult.fxRate, undefined, "row-only Save accepts the backend's optional null FX field");

  const changed = { ...saved, notes: "changed", winProbability: null };
  assert.deepEqual(buildAccountWorkloadPatch(saved, changed), {
    versionNo: 3,
    notes: "changed",
    winProbability: null
  });

  await patchAccountWorkload(41, buildAccountWorkloadPatch(saved, changed), fetchImpl);
  assert.equal(calls[1].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { versionNo: 3, notes: "changed", winProbability: null });

  await createAccountWorkload({ ...saved, id: "new-1", commitmentId: undefined, versionNo: undefined }, "FY27", fetchImpl);
  assert.equal(calls[2].init?.method, "POST");
  const createBody = JSON.parse(String(calls[2].init?.body));
  assert.equal(createBody.fiscalYear, "FY27");
  assert.equal("id" in createBody, false);
  assert.equal("commitmentId" in createBody, false);
  assert.equal("versionNo" in createBody, false);

  await deleteAccountWorkload(41, 4, fetchImpl);
  assert.equal(calls[3].url, "/api/v1/accounts-workloads/41?versionNo=4");
  assert.equal(calls[3].init?.method, "DELETE");

  await restoreAccountWorkload(41, 5, fetchImpl);
  assert.equal(calls[4].url, "/api/v1/accounts-workloads/41/restore?versionNo=5");
  assert.equal(calls[4].init?.method, "POST");

  await permanentlyDeleteAccountWorkload(41, 6, fetchImpl);
  assert.equal(calls[5].url, "/api/v1/accounts-workloads/41/permanent?versionNo=6");
  assert.equal(calls[5].init?.method, "DELETE");

  const summary = await fetchAccountsWorkloadsSummary("FY27", fetchImpl);
  assert.equal(calls[6].url, "/api/v1/dashboard/accounts-workloads?fiscalYear=FY27");
  assert.equal(summary.activeWorkloads, 3);

  calls.length = 0;
  await persistAccountWorkloadChanges(
    [saved],
    [
      { ...saved, notes: "changed" },
      { ...saved, id: "new-2", commitmentId: undefined, versionNo: undefined, account: "New Account" }
    ],
    "FY27",
    fetchImpl
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { versionNo: 3, notes: "changed" });
  assert.equal(calls[1].init?.method, "POST");

  calls.length = 0;
  await persistAccountWorkloadChanges([saved], [{ ...saved, isDeleted: true }], "FY27", fetchImpl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.method, "DELETE");

  calls.length = 0;
  await persistAccountWorkloadChanges(
    [{ ...saved, isDeleted: true, versionNo: 4 }],
    [{ ...saved, isDeleted: false, versionNo: 4 }],
    "FY27",
    fetchImpl
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v1/accounts-workloads/41/restore?versionNo=4");
  assert.equal(calls[0].init?.method, "POST");

  calls.length = 0;
  await persistAccountWorkloadChanges(
    [{ ...saved, isDeleted: true, versionNo: 4 }],
    [{ ...saved, isDeleted: true, versionNo: 4 }],
    "FY27",
    fetchImpl,
    [saved.id]
  );
  assert.equal(calls.length, 1, "permanent delete targets must not also be patched or restored");
  assert.equal(calls[0].url, "/api/v1/accounts-workloads/41/permanent?versionNo=4");

  calls.length = 0;
  await persistAndReconcileAccountWorkloadChanges(
    [{ ...saved, isDeleted: true, versionNo: 4 }],
    [{ ...saved, isDeleted: true, versionNo: 4 }],
    "FY27",
    { fiscalYear: "FY27", includeDeleted: true },
    fetchImpl,
    [saved.id]
  );
  assert.equal(calls.filter((call) => call.init?.method === "DELETE").length, 1);
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 0);

  const conflictFetch = async () => response({ code: "VERSION_CONFLICT", message: "reload" }, 409);
  await assert.rejects(
    () => patchAccountWorkload(41, { versionNo: 3, notes: "x" }, conflictFetch),
    (error: unknown) => error instanceof Error && error.name === "AccountsWorkloadsApiError" && (error as Error & { status: number }).status === 409
  );

  (globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string }).__KPI_API_BASE_URL__ = "http://127.0.0.1:8080/api/v1/";
  calls.length = 0;
  await fetchAccountsWorkloadsSummary("FY27", fetchImpl);
  assert.equal(calls[0].url, "http://127.0.0.1:8080/api/v1/dashboard/accounts-workloads?fiscalYear=FY27");
  const malformedFetch = async () => response({ items: "not-an-array", total: 1 });
  await assert.rejects(
    () => fetchAccountsWorkloads({ fiscalYear: "FY27" }, malformedFetch),
    /malformed/i,
    "malformed successful responses must surface as errors"
  );
  const malformedRowFetch = async () => response({ items: [{ id: "incomplete" }], total: 1 });
  await assert.rejects(
    () => fetchAccountsWorkloads({ fiscalYear: "FY27" }, malformedRowFetch),
    /malformed/i,
    "malformed row objects must surface as errors"
  );

  let wrappedNetworkError: unknown;
  try {
    await fetchAccountsWorkloads(
      { fiscalYear: "FY27" },
      async () => { throw new TypeError("fetch failed"); }
    );
  } catch (error) {
    wrappedNetworkError = error;
  }
  const developmentRuntime = { location: { hostname: "localhost" } };
  assert.equal(canUseDevelopmentDataFallback(wrappedNetworkError, developmentRuntime), true);
  assert.equal(
    canUseDevelopmentDataFallback(new TypeError("response processing failed"), developmentRuntime),
    false,
    "only a TypeError raised by the fetch transport may enable fallback"
  );

  const untouched = { ...saved, id: "42", commitmentId: 42, versionNo: 1, notes: "client-old" };
  const partialCalls: string[] = [];
  let partialAttempt = 0;
  const partialFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    partialCalls.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "PATCH") return response({ ...saved, notes: "patched", versionNo: 4 });
    if (init?.method === "POST") {
      partialAttempt += 1;
      if (partialAttempt === 1) return response({ code: "CREATE_FAILED", message: "create failed" }, 500);
      return response({ ...saved, id: "52", commitmentId: 52, versionNo: 1, account: "New Account" });
    }
    return response({
      items: [
        { ...saved, notes: "patched", versionNo: 4 },
        { ...untouched, notes: "server-new", versionNo: 2 }
      ],
      total: 2
    });
  };
  const partialDrafts = [
    { ...saved, notes: "patched" },
    untouched,
    { ...saved, id: "new-partial", commitmentId: undefined, versionNo: undefined, account: "New Account" }
  ];
  let reconciledError: AccountsWorkloadsPersistenceError | undefined;
  try {
    await persistAndReconcileAccountWorkloadChanges(
      [saved, untouched], partialDrafts, "FY27",
      { fiscalYear: "FY27", includeDeleted: true, sort: "account", direction: "asc" },
      partialFetch
    );
  } catch (error) {
    assert.ok(error instanceof AccountsWorkloadsPersistenceError);
    reconciledError = error;
  }
  assert.ok(reconciledError, "partial failure must expose reconciled server state");
  assert.equal(reconciledError.authoritative.items[0].versionNo, 4);
  assert.equal(
    reconciledError.retryRows.find((row) => row.commitmentId === 42)?.notes,
    "server-new",
    "an unchanged local row must not overwrite a concurrently refreshed server row"
  );
  assert.equal(reconciledError.retryRows.find((row) => row.commitmentId === 41)?.notes, "patched");
  assert.ok(reconciledError.retryRows.some((row) => row.id === "new-partial"));
  await persistAndReconcileAccountWorkloadChanges(
    reconciledError.authoritative.items,
    reconciledError.retryRows,
    "FY27",
    { fiscalYear: "FY27", includeDeleted: true, sort: "account", direction: "asc" },
    partialFetch
  );
  assert.equal(partialCalls.filter((call) => call.startsWith("PATCH ")).length, 1, "successful patches must not be resent");
  assert.equal(partialCalls.filter((call) => call.startsWith("POST ")).length, 2, "only the failed create may be retried");

  const refreshFailureCalls: string[] = [];
  let refreshAttempt = 0;
  const refreshFailureFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    refreshFailureCalls.push(`${init?.method ?? "GET"} ${String(input)}`);
    if (init?.method === "PATCH") return response({ ...saved, notes: "saved-before-refresh", versionNo: 4 });
    refreshAttempt += 1;
    if (refreshAttempt === 1) throw new TypeError("refresh network failed");
    return response({ items: [{ ...saved, notes: "saved-before-refresh", versionNo: 4 }], total: 1 });
  };
  let refreshPersistenceError: AccountsWorkloadsPersistenceError | undefined;
  try {
    await persistAndReconcileAccountWorkloadChanges(
      [saved],
      [{ ...saved, notes: "saved-before-refresh" }],
      "FY27",
      { fiscalYear: "FY27", includeDeleted: true, sort: "account", direction: "asc" },
      refreshFailureFetch
    );
  } catch (error) {
    assert.ok(error instanceof AccountsWorkloadsPersistenceError);
    refreshPersistenceError = error;
  }
  assert.ok(refreshPersistenceError, "a refresh failure after writes must expose reconciled retry state");
  await persistAndReconcileAccountWorkloadChanges(
    refreshPersistenceError.authoritative.items,
    refreshPersistenceError.retryRows,
    "FY27",
    { fiscalYear: "FY27", includeDeleted: true, sort: "account", direction: "asc" },
    refreshFailureFetch
  );
  assert.equal(
    refreshFailureCalls.filter((call) => call.startsWith("PATCH ")).length,
    1,
    "a successful write must not be resent when its refresh failed"
  );

  assert.equal(canUseDevelopmentDataFallback(new TypeError("fetch failed"), developmentRuntime), false);
  assert.equal(canUseDevelopmentDataFallback({ name: "AccountsWorkloadsApiError", status: 404 }, developmentRuntime), true);
  for (const status of [401, 403, 500]) {
    assert.equal(
      canUseDevelopmentDataFallback({ name: "AccountsWorkloadsApiError", status }, developmentRuntime),
      false,
      `${status} must not silently fall back`
    );
  }
  assert.equal(canUseDevelopmentDataFallback(new Error("Malformed response"), developmentRuntime), false);
  assert.equal(
    canUseDevelopmentDataFallback(new TypeError("fetch failed"), {
      location: { hostname: "localhost" },
      __KPI_API_BASE_URL__: "http://configured.example/api/v1"
    }),
    false,
    "an explicitly configured API must never silently fall back"
  );
  assert.equal(
    canUseDevelopmentDataFallback(new TypeError("fetch failed"), { location: { hostname: "app.example" } }),
    false,
    "deployed environments must never silently fall back"
  );

  delete (globalThis as typeof globalThis & { __KPI_API_BASE_URL__?: string }).__KPI_API_BASE_URL__;
  console.log("accountsWorkloadsApi tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
