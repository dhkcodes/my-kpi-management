import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { navItems } from "../src/data/kpiMockData";
import { getNavigationRoute } from "../src/components/navigationRoutes";
import {
  AccountsWorkloadsApiError,
  dedupeForecastCandidates,
  fetchAccountsWorkloadsHierarchy,
  fetchForecastCandidates,
  saveAccountsWorkloadsHierarchy,
  type AccountsWorkloadsHierarchySaveRequest,
  type ForecastCandidate
} from "../src/data/accountsWorkloadsApi";

const topLevelLabels = navItems.map((item) => item.label);
assert.deepEqual(topLevelLabels, ["Home", "My Activities", "Account Management", "KPI", "Consumption"]);
assert.deepEqual(navItems[1].children?.map((item) => item.id), ["weekly-activities"]);
assert.deepEqual(navItems[2].children?.map((item) => item.id), ["account-management-overview", "accounts-workloads"]);
assert.equal(navItems.some((item) => item.children?.some((child) => child.id === "customers-overview")), false);
assert.equal(getNavigationRoute("customers-overview").module, "myCustomers360", "legacy portfolio URL remains available");
assert.equal(getNavigationRoute("account-management-overview").module, "accountManagementOverview");

const emptyHierarchy = { fiscalYear: null, accounts: [] } as const;

async function run() {
  let hierarchyUrl = "";
  await fetchAccountsWorkloadsHierarchy({ search: "Acme", includeArchived: true }, async (input) => {
    hierarchyUrl = String(input);
    return new Response(JSON.stringify(emptyHierarchy), { status: 200 });
  });
  assert.match(hierarchyUrl, /accounts-workloads\/hierarchy\?/);
  assert.match(hierarchyUrl, /search=Acme/);
  assert.match(hierarchyUrl, /includeArchived=true/);
  assert.doesNotMatch(hierarchyUrl, /fiscalYear/i, "hierarchy request is FY-independent");

  const candidates: ForecastCandidate[] = [
    { accountName: "Acme", normalizedAccount: "ACME", planId: null, planNumber: null, linked: false, linkedWorkloadIds: [] },
    { accountName: " Acme ", normalizedAccount: "ACME", planId: null, planNumber: null, linked: false, linkedWorkloadIds: [] },
    { accountName: "Beta", normalizedAccount: "BETA", planId: 7, planNumber: "PLAN-7", linked: true, linkedWorkloadIds: [3] }
  ];
  assert.deepEqual(dedupeForecastCandidates(candidates).map((item) => item.accountName), ["Acme", "Beta"]);
  let candidateUrl = "";
  await fetchForecastCandidates(async (input) => {
    candidateUrl = String(input);
    return new Response(JSON.stringify(candidates), { status: 200 });
  });
  assert.match(candidateUrl, /accounts-workloads\/forecast-candidates$/);
  assert.doesNotMatch(candidateUrl, /scope=|search=/, "complete candidate endpoint is not accidentally filtered");

  const saveRequest: AccountsWorkloadsHierarchySaveRequest = {
    accounts: [{ id: null, clientId: "account-1", versionNo: null, name: "Acme", action: "UPSERT" }],
    workloads: [{ id: null, clientId: "workload-2", accountRef: "account-1", versionNo: null, name: "Database", action: "UPSERT" }],
    deals: [], workloadPlans: []
  };
  let saveUrl = "";
  let saveBody: unknown;
  const saved = await saveAccountsWorkloadsHierarchy(saveRequest, async (input, init) => {
    saveUrl = String(input); saveBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ hierarchy: emptyHierarchy }), { status: 200 });
  });
  assert.match(saveUrl, /accounts-workloads\/hierarchy\/save$/);
  assert.deepEqual(saveBody, saveRequest);
  assert.deepEqual(saved, emptyHierarchy);

  await assert.rejects(
    () => saveAccountsWorkloadsHierarchy(saveRequest, async () => new Response(JSON.stringify({
      code: "BATCH_VALIDATION_FAILED",
      message: "One or more operations are invalid",
      errors: [{ operationIndex: 0, entity: "account", clientId: "account-1", field: "name", code: "REQUIRED", message: "Name is required" }]
    }), { status: 422 })),
    (error: unknown) => error instanceof AccountsWorkloadsApiError
      && error.code === "BATCH_VALIDATION_FAILED"
      && error.errors[0]?.clientId === "account-1"
      && error.errors[0]?.field === "name"
  );

  const pageSource = readFileSync("src/components/content/AccountsWorkloadsPage.tsx", "utf8");
  const contentSource = readFileSync("src/components/content/index.tsx", "utf8");
  assert.match(pageSource, /fetchAccountsWorkloadsHierarchy/);
  assert.match(pageSource, /saveAccountsWorkloadsHierarchy/);
  assert.match(pageSource, /fetchForecastCandidates/);
  assert.match(pageSource, /Forecast에서 추가/);
  assert.match(pageSource, /Add Account/);
  assert.match(pageSource, /Add Workload/);
  assert.match(pageSource, /Add Deal/);
  assert.match(pageSource, /accounts-hierarchy__plans/, "Account → Workload → Plan → Deal hierarchy is rendered");
  assert.match(pageSource, /saveError instanceof AccountsWorkloadsApiError/, "structured batch errors are rendered without clearing the draft");
  assert.match(pageSource, /Keep the complete draft and queued operations/, "draft edits survive save errors");
  assert.doesNotMatch(pageSource, /Clone Previous FY|clone-preview/, "FY clone UI is removed");
  assert.match(contentSource, /accountsWorkloads[\s\S]{0,120}accountManagementOverview[\s\S]{0,120}kpi-fiscal-year-panel/, "AW route omits the fiscal-year control");

  console.log("FY-independent hierarchical AW/Deal frontend contracts passed");
}

void run();
