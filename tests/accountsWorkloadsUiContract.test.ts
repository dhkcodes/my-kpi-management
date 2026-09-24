import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/AccountsWorkloadsPage.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");
const unsavedDeleteHandler = page.slice(page.indexOf("const removeUnsavedSelected"), page.indexOf("const deleteSelected"));
const deleteHandler = page.slice(page.indexOf("const deleteSelected"), page.indexOf("const cancelSelected"));
const cancelHandler = page.slice(page.indexOf("const cancelSelected"), page.indexOf("const saveAwDrafts"));

assert.match(page, /type AwField = "account" \| "workload" \| "plan" \| "lastUpdated" \| "notes"/);
assert.match(page, /onDblClick=.*beginAwEdit/,
  "saved AW cells remain display-first and enter edit mode only on double-click");
assert.match(page, /field === "lastUpdated" \|\| field === "notes"/,
  "Latest Update and Notes retain multiline editors");
assert.match(page, /accounts-workloads-ellipsis/);
assert.match(page, /accounts-workloads-instant-tooltip" role="tooltip">\{value\}/,
  "truncated cells expose their full content immediately through the shared tooltip renderer");
assert.doesNotMatch(page, /Double-click to edit/);
assert.match(page, /Account[\s\S]*Workload[\s\S]*Plan Number[\s\S]*ARR\(\$\)[\s\S]*ACR\(\$\)[\s\S]*Oppty Count[\s\S]*Latest Update[\s\S]*Notes/);
assert.match(page, /sortField === "arrUsd"/);
assert.match(page, /sortField === "acrUsd"/);
assert.match(page, /sortField === "acrUsd"[\s\S]*return deals\.length/,
  "opportunity count sorting uses the visible child opportunity count");
assert.match(page, /key: rowKey\(account\.id, workload\.id\)/,
  "selection, expansion and sorting use stable entity IDs");
const api = readFileSync("src/data/accountsWorkloadsApi.ts", "utf8");
assert.match(page, /pendingDeleteWorkloadIds/,
  "saved workloads use an explicit local pending-delete draft state");
assert.match(page, /setPendingDeleteWorkloadIds/);
assert.doesNotMatch(deleteHandler, /saveAccountsWorkloadsHierarchy|fetch\(/,
  "the first Delete is a local draft transition and never calls the API");
assert.match(unsavedDeleteHandler, /workload\.id < 0[\s\S]*filter\(\(workload\) => !removedWorkloadIds\.has\(workload\.id\)\)/,
  "unsaved workload deletion is local removal");
assert.match(page, /allRows[\s\S]*rows = useMemo\([\s\S]*!pendingDeleteWorkloadIds\.has\(row\.workload\.id\)/,
  "pending-delete workloads and their child opportunities are excluded from rendering and row aggregates immediately");
assert.match(cancelHandler, /savedAccount = baseline\.accounts\.find[\s\S]*savedAccount\?\.workloads\.find[\s\S]*setPendingDeleteWorkloadIds\(\(current\) => new Set\(\[\.\.\.current\]\.filter/,
  "Cancel restores the saved workload and children from the baseline and clears its pending-delete state");
assert.match(page, /pendingDeleteWorkloadIds\.has\(workload\.id\)[\s\S]*action: "ARCHIVE"/,
  "Save turns the pending-delete draft into one workload-level logical delete action");
assert.match(page, /archivedIds[\s\S]*workloads\.filter\(\(workload\) => !archivedIds\.has\(workload\.id\)\)/,
  "a successful logical delete remains absent even if the save response contains the archived workload");
assert.match(page, /setPendingDeleteWorkloadIds\(new Set\(\)\)[\s\S]*setSelectedRows\(new Set\(\)\)/,
  "a successful logical delete clears local pending-delete state only after the server accepts it");
assert.doesNotMatch(page, /window\.confirm|permanentTargets|PERMANENT_DELETE|irreversible|delete permanently/i,
  "there is no repeat-delete or permanent-delete confirmation UX");
assert.doesNotMatch(api, /PERMANENT_DELETE/,
  "PERMANENT_DELETE is not part of the frontend API action mapping");
assert.match(page, />Delete<\/button>/);
assert.match(page, />Cancel<\/button>/);
assert.doesNotMatch(page, />Archive<\/button>|>Restore<\/button>|Include archived/,
  "Archive, Restore and archived filtering are not exposed");
assert.match(page, /<div>\{breadcrumb\}<span class="kpi-eyebrow">My Customers 360<\/span><h1 id="accountsWorkloadsTitle">/,
  "the menu path is rendered above the page title");
assert.match(page, /highlighted: !workload\.highlighted/);
assert.match(page, /const savedWorkload = baseline\.accounts\.find[\s\S]*name: savedWorkload\.name[\s\S]*lastUpdated: savedWorkload\.lastUpdated[\s\S]*notes: savedWorkload\.notes/,
  "Highlight persistence does not commit unrelated unsaved AW field edits");
assert.match(page, /toggleHighlight[\s\S]*saveAccountsWorkloadsHierarchy\(request\)[\s\S]*setBaseline/,
  "Highlight changes are persisted and adopted as the new baseline");
assert.match(page, /accounts-workloads-child-row/);
assert.match(page, /Oppty Name/);
assert.match(page, /Oppty ID/);
assert.match(page, /Add Opportunity/);
assert.match(page, /deals: \[dealWrite\(draft\.deal, draft\.workloadId\)\]/,
  "an opportunity row Save sends only that opportunity operation");
assert.match(page, /const mergeDeals[\s\S]*setHierarchy\(\(current\) => mergeDeals\(current\)\)[\s\S]*setBaseline\(\(current\) => mergeDeals\(current\)\)/,
  "an opportunity Save merges only that workload's server-confirmed deals and preserves unrelated AW/opportunity drafts");
assert.match(page, /cancelDeal\(draftKey\)/,
  "an opportunity row Cancel is isolated to that opportunity draft");
assert.match(page, /draft\.original \? "Cancel" : "Draft Delete"/,
  "unsaved opportunities can be discarded without API writes");
assert.match(page, /Save the parent AW before adding opportunities/);
assert.doesNotMatch(page, /notes: draft\.deal\.notes/,
  "opportunity Notes is excluded from the editor and save payload");
assert.match(page, /Add from Records/);
assert.match(page, /filterForecastCandidates\(forecastCandidates, hierarchy\.accounts\)/);
assert.match(api, /if \(candidate\.planId !== null\) return \[`plan-id:\$\{candidate\.planId\}`\][\s\S]*normalizedAccountIdentity/,
  "Add from Records uses Plan ID first and normalized Account exact-match only as fallback");
assert.match(page, /CANDIDATE_WORKLOAD_NAME = "미정의 — 수정 필요"/);
assert.match(page, /requestError instanceof AccountsWorkloadsApiError/);
assert.match(page, /setSaveErrors\(requestError instanceof AccountsWorkloadsApiError/,
  "AW drafts survive failed saves");
assert.match(page, /accounts-workloads-toolbar--compact/,
  "AW uses a compact title/search/action/table rhythm without importing Consumption filters");
assert.doesNotMatch(page, /selectedPillar|selectedQuarter|consumption-pillar-selector|consumption-plan-filter/,
  "Consumption Records contributes positioning and spacing only, not its filter controls or behavior");
assert.match(styles, /\.accounts-workloads-toolbar--compact/);
assert.match(styles, /\.accounts-workloads-oppty-grid th:nth-child\(1\)/);
assert.match(styles, /\.accounts-workloads-oppty-grid th:nth-child\(2\)/);
assert.match(styles, /position:\s*sticky/,
  "opportunity name and ID columns remain fixed during child-table horizontal scrolling");

console.log("Accounts & Workloads hierarchy editable UI contracts passed");
