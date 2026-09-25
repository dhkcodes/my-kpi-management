import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/AccountsWorkloadsPage.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");
const unsavedDeleteHandler = page.slice(page.indexOf("const removeUnsavedSelected"), page.indexOf("const deleteSelected"));
const deleteHandler = page.slice(page.indexOf("const deleteSelected"), page.indexOf("const cancelSelected"));
const permanentDeleteHandler = page.slice(page.indexOf("const confirmPermanentDelete"), page.indexOf("const deleteSelected"));
const cancelHandler = page.slice(page.indexOf("const cancelSelected"), page.indexOf("const saveAwDrafts"));

assert.match(page, /type AwField = "account" \| "workload" \| "plan" \| "lastUpdated" \| "notes"/);
assert.match(page, /onDblClick={[\s\S]*beginAwEdit/,
  "saved AW cells remain display-first and enter edit mode only on double-click");
assert.match(page, /field === "lastUpdated" \|\| field === "notes"/,
  "Latest Update and Notes retain multiline editors");
assert.match(page, /accounts-workloads-ellipsis/);
assert.match(page, /accounts-workloads-instant-tooltip/,
  "truncated cells use the overflow-safe zero-delay tooltip");
assert.doesNotMatch(page, /class="accounts-workloads-ellipsis" title=/,
  "truncated cells do not fall back to the delayed native title tooltip");
assert.doesNotMatch(page, /Double-click to edit/);
assert.match(page, /Account[\s\S]*Workload[\s\S]*Plan Number[\s\S]*ARR\(\$\)[\s\S]*ACR\(\$\)[\s\S]*Oppty Count[\s\S]*Latest Update[\s\S]*Notes/);
assert.match(page, /sortField === "arrUsd"/);
assert.match(page, /sortField === "acrUsd"/);
assert.match(page, /sortField === "acrUsd"[\s\S]*return deals\.length/,
  "opportunity count sorting uses the visible child opportunity count");
assert.match(page, /key: rowKey\(account\.id, workload\.id\)/,
  "selection, expansion and sorting use stable entity IDs");
const api = readFileSync("src/data/accountsWorkloadsApi.ts", "utf8");
assert.match(deleteHandler, /row\.workload\.archived[\s\S]*action: "ARCHIVE"[\s\S]*await saveAccountsWorkloadsHierarchy\(request\)[\s\S]*await reload\(\)/,
  "the first Delete immediately persists Draft Delete and refreshes the list");
assert.match(unsavedDeleteHandler, /workload\.id < 0[\s\S]*filter\([\s\S]*!removedWorkloadIds\.has\(workload\.id\)/,
  "unsaved workload deletion is local removal");
assert.match(page, /const rows = allRows/,
  "visible hierarchy rows are derived from the server response");
assert.match(cancelHandler, /savedAccount = baseline\.accounts\.find/);
assert.match(cancelHandler, /savedAccount\?\.workloads\.find/);
assert.match(page, /setNotice\(`\$\{draftTargets\.length\} AW moved to Draft Delete/,
  "server-accepted Draft Delete reports completion immediately");
assert.match(page, /<oj-dialog/);
assert.match(page, /Permanently delete/);
assert.match(page, /confirmPermanentDelete/,
  "repeat Delete on a Draft Delete workload requires an Oracle JET confirmation dialog");
assert.match(permanentDeleteHandler, /PERMANENT_DELETE/,
  "confirmation invokes the permanent-delete API action");
assert.match(page, /row\.workload\.name/);
assert.match(page, /row\.workload\.deals\.length/);
assert.match(page, /cannot be[\s\S]*undone/i,
  "the permanent-delete confirmation identifies each AW and its child opportunity count");
assert.match(api, /PERMANENT_DELETE/,
  "PERMANENT_DELETE is mapped by the frontend API contract");
assert.match(page, /Draft Delete/);
assert.match(page, /Include Deleted/);
assert.doesNotMatch(page, />Archive<\/button>|>Restore<\/button>|Include archived/,
  "legacy Archive/Restore wording is not exposed");
assert.match(page, /<div>[\s\S]*\{breadcrumb\}[\s\S]*<span class="kpi-eyebrow">[\s\S]*My Customers 360[\s\S]*<h1 id="accountsWorkloadsTitle">/,
  "the menu path is rendered above the page title");
assert.match(page, /highlighted: !workload\.highlighted/);
assert.match(page, /const savedWorkload = baseline\.accounts/);
assert.match(page, /name: savedWorkload\.name/);
assert.match(page, /lastUpdated: savedWorkload\.lastUpdated/);
assert.match(page, /notes: savedWorkload\.notes/,
  "Highlight persistence does not commit unrelated unsaved AW field edits");
assert.match(page, /toggleHighlight[\s\S]*saveAccountsWorkloadsHierarchy\(request\)[\s\S]*setBaseline/,
  "Highlight changes are persisted and adopted as the new baseline");
assert.match(page, /accounts-workloads-child-row/);
assert.match(page, /Oppty Name/);
assert.match(page, /Oppty ID/);
assert.match(page, /Add Opportunity/);
assert.match(page, /deals: \[dealWrite\(draft\.deal, draft\.workloadId, draft\.original\)\]/,
  "an opportunity row Save sends only that opportunity operation and its original baseline");
assert.match(page, /const mergeDeals[\s\S]*setHierarchy\(\(current\) => mergeDeals\(current\)\)[\s\S]*setBaseline\(\(current\) => mergeDeals\(current\)\)/,
  "an opportunity Save merges only that workload's server-confirmed deals and preserves unrelated AW/opportunity drafts");
assert.match(page, /cancelDeal\(activeDraft\.key\)/,
  "an opportunity row Cancel is isolated to that opportunity draft");
assert.match(page, /const hasNewDeal = \[\.\.\.dealDrafts\.values\(\)\]\.some/,
  "only one unsaved opportunity can exist across the page");
assert.match(page, /const hasNewAw = allRows\.some/,
  "only one unsaved AW can be added before Save or Cancel");
assert.match(page, /<oj-input-date/,
  "opportunity date editing uses the Oracle JET calendar");
assert.match(page, /\{ length: 16 \}[\s\S]*FY\$\{24 \+ Math\.floor/,
  "new Target selections stop at FY27 Q4");
assert.match(page, /Save the parent AW before adding opportunities/);
assert.doesNotMatch(page, /notes: draft\.deal\.notes/,
  "opportunity Notes is excluded from the editor and save payload");
assert.match(page, /Add from Records/);
assert.match(page, /filterForecastCandidates\(forecastCandidates, hierarchy\.accounts\)/);
assert.match(api, /if \(candidate\.planId !== null\) return \[`plan-id:\$\{candidate\.planId\}`\][\s\S]*normalizedAccountIdentity/,
  "Add from Records uses Plan ID first and normalized Account exact-match only as fallback");
assert.match(page, /CANDIDATE_WORKLOAD_NAME = "미정의 — 수정 필요"/);
assert.match(page, /requestError instanceof AccountsWorkloadsApiError/);
assert.match(page, /setSaveErrors\(/,
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
assert.match(page, /Scroll opportunities left/);
assert.match(page, /Scroll opportunities right/,
  "opportunity rows can move horizontally even when the bottom scrollbar is outside the viewport");
assert.match(page, /event\.ctrlKey && !event\.metaKey/,
  "row click selection preserves Ctrl or Command multi-selection while double click remains editing");
assert.match(page, /field === "revenueType"[\s\S]*value=\{value\}[\s\S]*<option value="NEW">/,
  "Revenue Type editing selects the current value");
assert.match(styles, /accounts-workloads-child-row > td \{[^}]*padding: 14px 14px 14px 62px/,
  "expanded opportunity boxes keep equal top and bottom spacing");
assert.match(styles, /accounts-workloads-aw-grid th:nth-child\(4\)/);
assert.match(styles, /accounts-workloads-aw-grid th:nth-child\(5\)/,
  "Account and Workload columns remain fixed");

console.log("Accounts & Workloads hierarchy editable UI contracts passed");
