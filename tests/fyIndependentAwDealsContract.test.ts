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
assert.equal(getNavigationRoute("customers-overview").module, "home", "legacy portfolio URL is disabled");
assert.equal(getNavigationRoute("account-management-overview").module, "accountManagementOverview");

const emptyHierarchy = { fiscalYear: null, accounts: [] } as const;

async function run() {
  let hierarchyUrl = "";
  let hierarchyInit: RequestInit | undefined;
  await fetchAccountsWorkloadsHierarchy({ search: "Acme", includeArchived: true }, async (input, init) => {
    hierarchyUrl = String(input);
    hierarchyInit = init;
    return new Response(JSON.stringify(emptyHierarchy), { status: 200 });
  });
  assert.match(hierarchyUrl, /accounts-workloads\/hierarchy\?/);
  assert.match(hierarchyUrl, /search=Acme/);
  assert.equal(hierarchyInit?.cache, "no-store",
    "authoritative hierarchy reads must bypass browser caches after writes");
  assert.match(hierarchyUrl, /includeArchived=true/);
  assert.doesNotMatch(hierarchyUrl, /fiscalYear/i, "hierarchy request is FY-independent");

  const candidates: ForecastCandidate[] = [
    { candidateKey: "ACCOUNT:ACME", accountName: "Acme", normalizedAccount: "ACME", salesRep: "Alice", planId: null, planNumber: null, linked: false, linkedWorkloadIds: [], excluded: false },
    { candidateKey: "ACCOUNT:ACME", accountName: " Acme ", normalizedAccount: "ACME", salesRep: "Alice", planId: null, planNumber: null, linked: false, linkedWorkloadIds: [], excluded: false },
    { candidateKey: "PLAN_ID:7", accountName: "Beta", normalizedAccount: "BETA", salesRep: "Bob", planId: 7, planNumber: "PLAN-7", linked: true, linkedWorkloadIds: [3], excluded: false },
    { candidateKey: "PLAN_ID:8", accountName: "Acme", normalizedAccount: "ACME", salesRep: "Alice", planId: 8, planNumber: "PLAN-8", linked: false, linkedWorkloadIds: [], excluded: false },
    { candidateKey: "PLAN_ID:9", accountName: "Acme", normalizedAccount: "ACME", salesRep: "Alice", planId: 9, planNumber: "PLAN-9", linked: false, linkedWorkloadIds: [], excluded: false },
    { candidateKey: "PLAN_ID:80", accountName: "Renamed account", normalizedAccount: "RENAMED ACCOUNT", salesRep: null, planId: 80, planNumber: "PLAN-8", linked: false, linkedWorkloadIds: [], excluded: false }
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
  }, {
    id: 20, versionNo: 1, name: "Unrelated registered account", archived: true,
    workloads: [{
      id: 21, versionNo: 1, name: "Archived workload", salesRep: null, lastUpdated: null, notes: null, highlighted: false, archived: true, deals: [],
      plans: [
        { id: 22, workloadId: 21, sourcePlanId: 10, sourcePlanNumber: " 0009.0 ", versionNo: 1 },
        { id: 23, workloadId: 21, sourcePlanId: null, sourcePlanNumber: "42416424", versionNo: 1 },
        { id: 24, workloadId: 21, sourcePlanId: null, sourcePlanNumber: "   ", versionNo: 1 },
        { id: 25, workloadId: 21, sourcePlanId: null, sourcePlanNumber: "9A", versionNo: 1 },
        { id: 26, workloadId: 21, sourcePlanId: null, sourcePlanNumber: "42459532 Active", versionNo: 1 },
        { id: 27, workloadId: 21, sourcePlanId: null, sourcePlanNumber: "42450000 ACTIVE", versionNo: 1 }
      ]
    }]
  }];
  assert.deepEqual(
    filterForecastCandidates([
      ...candidates,
      { candidateKey: "PLAN_ID:81", accountName: "Acme", normalizedAccount: "ACME", salesRep: "Alice", planId: 81, planNumber: "PLAN-81", linked: false, linkedWorkloadIds: [], excluded: false },
      { candidateKey: "PLAN_ID:82", accountName: "Different plan match", normalizedAccount: "DIFFERENT PLAN MATCH", salesRep: null, planId: 82, planNumber: "42416424", linked: false, linkedWorkloadIds: [], excluded: false },
      { candidateKey: "PLAN_ID:83", accountName: "Legacy suffix match", normalizedAccount: "LEGACY SUFFIX MATCH", salesRep: null, planId: 83, planNumber: "42459532", linked: false, linkedWorkloadIds: [], excluded: false },
      { candidateKey: "PLAN_ID:84", accountName: "Malformed suffix", normalizedAccount: "MALFORMED SUFFIX", salesRep: null, planId: 84, planNumber: "42450000", linked: false, linkedWorkloadIds: [], excluded: false },
      { candidateKey: "PLAN_ID:9", accountName: "No cross-domain match", normalizedAccount: "NO CROSS DOMAIN MATCH", salesRep: null, planId: 9, planNumber: "OTHER-9", linked: false, linkedWorkloadIds: [], excluded: false },
      { candidateKey: "PLAN_ID:10", accountName: "Internal id match", normalizedAccount: "INTERNAL ID MATCH", salesRep: null, planId: 10, planNumber: "OTHER-10", linked: false, linkedWorkloadIds: [], excluded: false },
      { candidateKey: "ACCOUNT:DRAFT ONLY", accountName: "draft   only", normalizedAccount: "DRAFT ONLY", salesRep: null, planId: null, planNumber: null, linked: false, linkedWorkloadIds: [], excluded: false },
      { candidateKey: "ACCOUNT:DRAFT ONLY PLUS", accountName: "Draft only plus", normalizedAccount: "DRAFT ONLY PLUS", salesRep: "Carol", planId: null, planNumber: null, linked: false, linkedWorkloadIds: [], excluded: false }
    ], existingAccounts).map((item) => [item.accountName, item.planNumber]),
    [["Legacy suffix match", "42459532"], ["Malformed suffix", "42450000"], ["No cross-domain match", "OTHER-9"], ["Draft only plus", null]],
    "Plan Code, internal Plan ID, and exact normalized account names are independent exclusions; archived plans count and numeric-looking codes never cross-match internal IDs"
  );
  let candidateUrl = "";
  await fetchForecastCandidates(false, async (input) => {
    candidateUrl = String(input);
    return new Response(JSON.stringify(candidates), { status: 200 });
  });
  assert.match(candidateUrl, /accounts-workloads\/forecast-candidates\?includeExcluded=false$/);
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
  assert.match(pageSource, /Select recommendations to add as unsaved Account &amp; Workload drafts\./,
    "candidate dialog explains the concise draft-creation outcome");
  assert.doesNotMatch(pageSource, /removed independently[\s\S]*internal Plan ID/,
    "candidate dialog omits implementation-detail exclusion guidance");
  assert.match(pageSource, /candidate\.planNumber \?\? "No Plan Number"/, "missing plan numbers are shown explicitly without inventing one");
  assert.match(pageSource, /<th>Sales Rep<\/th>/, "recommendations show Sales Rep");
  assert.match(pageSource, /<td>\{candidate\.salesRep \?\? "—"\}<\/td>/, "missing Sales Rep stays visibly empty");
  assert.match(pageSource, /emptyWorkload\(workloadId, CANDIDATE_WORKLOAD_NAME, candidate\.salesRep\)/,
    "applying a recommendation carries its Sales Rep into the new workload draft");
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
