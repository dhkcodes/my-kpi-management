import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { navItems } from "../src/data/kpiMockData";
import { getNavigationRoute } from "../src/components/navigationRoutes";
import {
  AccountsWorkloadsApiError,
  dedupeForecastCandidates,
  filterForecastCandidates,
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
    { accountName: "Beta", normalizedAccount: "BETA", planId: 7, planNumber: "PLAN-7", linked: true, linkedWorkloadIds: [3] },
    { accountName: "Acme", normalizedAccount: "ACME", planId: 8, planNumber: "PLAN-8", linked: false, linkedWorkloadIds: [] },
    { accountName: "Acme", normalizedAccount: "ACME", planId: 9, planNumber: "PLAN-9", linked: false, linkedWorkloadIds: [] },
    { accountName: "Renamed account", normalizedAccount: "RENAMED ACCOUNT", planId: 80, planNumber: "PLAN-8", linked: false, linkedWorkloadIds: [] }
  ];
  assert.deepEqual(dedupeForecastCandidates(candidates).map((item) => item.planNumber),
    [null, "PLAN-7", "PLAN-8", "PLAN-9", "PLAN-8"],
    "same visible plan number with a different Plan ID remains a distinct candidate");
  const existingAccounts = [{
    id: 1, versionNo: 1, name: "Acme", archived: false,
    workloads: [{
      id: 2, versionNo: 1, name: "Database", salesRep: null, lastUpdated: null, notes: null, highlighted: false, archived: false, deals: [],
      plans: [{ id: 3, workloadId: 2, sourcePlanId: 8, sourcePlanNumber: "PLAN-8", versionNo: 1 }]
    }]
  }, {
    id: -1, versionNo: 0, name: "  Draft only  ", archived: false,
    workloads: [{ id: -2, versionNo: 0, name: "미정의 — 수정 필요", salesRep: null, lastUpdated: null, notes: null, highlighted: false, archived: false, deals: [], plans: [] }]
  }];
  assert.deepEqual(
    filterForecastCandidates([
      ...candidates,
      { accountName: "draft   only", normalizedAccount: "DRAFT ONLY", planId: null, planNumber: null, linked: false, linkedWorkloadIds: [] },
      { accountName: "Draft only plus", normalizedAccount: "DRAFT ONLY PLUS", planId: null, planNumber: null, linked: false, linkedWorkloadIds: [] }
    ], existingAccounts).map((item) => [item.accountName, item.planNumber]),
    [["Acme", "PLAN-9"], ["Renamed account", "PLAN-8"], ["Draft only plus", null]],
    "saved Plan IDs and unsaved exact-account drafts are excluded without fuzzy-merging distinct Plan IDs or account names"
  );
  let candidateUrl = "";
  await fetchForecastCandidates(async (input) => {
    candidateUrl = String(input);
    return new Response(JSON.stringify(candidates), { status: 200 });
  });
  assert.match(candidateUrl, /accounts-workloads\/forecast-candidates$/);
  assert.doesNotMatch(candidateUrl, /scope=|search=/, "complete candidate endpoint is not accidentally filtered");

  const saveRequest: AccountsWorkloadsHierarchySaveRequest = {
    accounts: [{ id: null, clientId: "account-1", versionNo: null, name: "Acme", action: "UPSERT" }],
    workloads: [{ id: null, clientId: "workload-2", accountRef: "account-1", versionNo: null, name: "Database", salesRep: null, lastUpdated: null, notes: null, action: "UPSERT" }],
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
  assert.match(pageSource, /Account Recommendations/);
  assert.match(pageSource, /미정의 — 수정 필요/);
  assert.match(pageSource, /type="checkbox"/, "candidate dialog supports multi-selection");
  assert.match(pageSource, /Plan ID is matched first/, "candidate dialog explains Plan ID precedence");
  assert.match(pageSource, /candidate\.planNumber \?\? "No Plan Number"/, "missing plan numbers are shown explicitly without inventing one");
  assert.match(pageSource, /sourcePlanNumber: candidate\.planNumber/, "selected candidates carry their original plan number into the AW draft");
  assert.match(pageSource, /emptyWorkload[\s\S]{0,240}deals: \[\]/, "candidate-created workloads do not create an opportunity");
  assert.match(pageSource, /Add Account & Workload/);
  assert.match(pageSource, /Add Opportunity|accounts-workloads-child-row/, "opportunity management is isolated in the expandable child table");
  assert.match(pageSource, /accounts-workloads-grid/, "wide Account → Workload table is rendered");
  assert.match(pageSource, /saveError instanceof AccountsWorkloadsApiError/, "structured batch errors are rendered without clearing the draft");
  assert.match(pageSource, /setSaveErrors\([\s\S]{0,120}saveError instanceof AccountsWorkloadsApiError/, "draft edits survive save errors");
  assert.doesNotMatch(pageSource, /Clone Previous FY|clone-preview/, "FY clone UI is removed");
  assert.match(contentSource, /accountsWorkloads[\s\S]{0,120}accountManagementOverview[\s\S]{0,120}kpi-fiscal-year-panel/, "AW route omits the fiscal-year control");

  console.log("FY-independent AW-only frontend and Consumption candidate contracts passed");
}

void run();
