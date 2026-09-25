import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/AccountsWorkloadsPage.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");
const unsavedDeleteHandler = page.slice(page.indexOf("const removeUnsavedSelected"), page.indexOf("const deleteSelected"));
const deleteHandler = page.slice(page.indexOf("const deleteSelected"), page.indexOf("const cancelSelected"));
const permanentDeleteHandler = page.slice(page.indexOf("const confirmPermanentDelete"), page.indexOf("const deleteSelected"));
const cancelHandler = page.slice(page.indexOf("const cancelSelected"), page.indexOf("const saveAwDrafts"));
const saveDealHandler = page.slice(page.indexOf("const saveDealDrafts"), page.indexOf("const dealDisplay"));

assert.match(page, /type AwField = "account" \| "workload" \| "plan" \| "lastUpdated" \| "notes"/);
assert.match(page, /onDblClick={[\s\S]*beginAwEdit/,
  "saved AW cells remain display-first and enter edit mode only on double-click");
assert.match(page, /field === "lastUpdated" \|\| field === "notes"/,
  "Latest Update and Notes retain multiline editors");
assert.match(page, /accounts-workloads-ellipsis/);
assert.match(page, /element\.scrollWidth > element\.clientWidth \? value : ""/,
  "truncated cells expose their complete value through the browser tooltip");
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
assert.match(page, /action: "RESTORE"/,
  "included Draft Delete rows can be restored without recreating data");
assert.doesNotMatch(page, />Archive<\/button>|Include archived/,
  "legacy Archive wording is not exposed");
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
assert.match(page, /const changedDrafts = \[\.\.\.dealDrafts\.values\(\)\]\.filter\(isDealDraftChanged\)[\s\S]*const drafts = dealSaveLock\.tryStart\(changedDrafts\)[\s\S]*deals: drafts\.map\(\(draft\) => dealWrite/,
  "one opportunity Save sends every changed opportunity draft in one atomic hierarchy request");
assert.match(page, /const mergeConfirmedDeals[\s\S]*setHierarchy\(\(current\) => mergeConfirmedDeals\(current\)\)[\s\S]*setBaseline\(\(current\) => mergeConfirmedDeals\(current\)\)[\s\S]*setDealDrafts\(\(current\) =>/,
  "successful opportunity batch save merges confirmed deals without discarding unrelated AW drafts");
assert.doesNotMatch(saveDealHandler, /setDealDrafts\(new Map\(\)\)/,
  "a completed request cannot clear opportunity drafts created or changed while it was in flight");
assert.match(page, /const updateDealDraft[\s\S]*if \(dealSaveLock\.isLocked\(\)\) return/,
  "opportunity draft mutation is blocked immediately while a save is in flight");
assert.match(page, /cancelDeal\(activeDraft\.key\)/,
  "an opportunity row Cancel is isolated to that opportunity draft");
assert.doesNotMatch(page, /const hasNewDeal =|const hasNewAw =/,
  "new AW and opportunity drafts are not globally single-row locked");
assert.match(page, /new Map\(current\)\.set\(key, \{ key, workloadId, original: null, deal \}\)/,
  "multiple new opportunities are retained independently in the draft map");
assert.match(page, /setHierarchy\(\(current\) =>[\s\S]*accounts: \[/,
  "multiple new AW rows remain in hierarchy state until saved or cancelled");
assert.match(page, /<oj-input-date/,
  "opportunity date editing uses the Oracle JET calendar");
assert.match(page, /targetOptionsFor[\s\S]*fiscalYear - 1} Q3[\s\S]*fiscalYear \+ 1} Q2/,
  "Target Quarter offers previous FY H2, current FY and next FY H1");
assert.match(page, /Save the parent AW before adding opportunities/);
assert.doesNotMatch(page, /notes: draft\.deal\.notes/,
  "opportunity Notes is excluded from the editor and save payload");
assert.match(page, /Account Recommendations/);
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
assert.match(styles, /accounts-workloads-grid-wrap\.accounts-workloads-grid-wrap--compact\s*\{[^}]*overflow:\s*visible/,
  "the parent AW table no longer creates a horizontal scroll container");
assert.match(styles, /accounts-workloads-grid\.accounts-workloads-aw-grid\s*\{[^}]*min-width:\s*0/,
  "the high-specificity legacy AW minimum width is reset");
assert.match(styles, /accounts-workloads-grid\.accounts-workloads-aw-grid th,[\s\S]*accounts-workloads-grid\.accounts-workloads-aw-grid td\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*none/,
  "legacy per-column minimum widths cannot force horizontal overflow");
assert.match(styles, /accounts-workloads-aw-grid th:nth-child\(-n \+ 5\),[\s\S]*position:\s*static/,
  "AW identity and Plan columns explicitly override legacy sticky selectors");
assert.match(styles, /accounts-workloads-aw-grid[\s\S]*table-layout:\s*fixed[\s\S]*width:\s*100%/,
  "AW columns fit the available width rather than being clipped");
assert.match(page, /data-deal-draft-key[\s\S]*is-editing-cell input,[\s\S]*is-editing-cell textarea,[\s\S]*is-editing-cell select/,
  "opportunity inputs and textareas receive one-time row-scoped focus");
assert.doesNotMatch(page, /onFocus=\{focusToEnd\}/,
  "focus handlers do not repeatedly force the caret after the initial edit focus");
assert.match(page, /const changed = !baselineWorkload \|\| value !== original/,
  "all cells in a new AW row, including a blank Plan Number, retain draft styling");
assert.match(page, /element\.scrollWidth > element\.clientWidth \? value : ""/,
  "ellipsis cells expose the full value on hover only when truncated");
assert.match(page, /field === "plan"\s*\? \{[\s\S]*plans:/,
  "only the Plan editor can update the Plan value; Account edits cannot fall through to it");
assert.match(page, /selectedCount > 0 && !editCell && selectedDirtyCount === 0/,
  "AW delete actions are hidden whenever a cell is being edited");
assert.match(page, /selectedDeals\.size > 0 && !dealEditCell/,
  "Opportunity delete is hidden whenever an opportunity cell is being edited");
assert.match(page, /is-editing-cell[\s\S]*data-deal-draft-key/,
  "the active opportunity editor is discoverable by the one-time caret focus effect");
assert.match(page, /field === "winProbability" && value[\s\S]*}%`/,
  "WIN PROB. keeps numeric editing but appends percent in display mode");
assert.match(styles, /is-pending-delete > td:nth-child\(5\)[\s\S]*background:\s*#fff1ed/,
  "Plan Number receives the same Draft Delete background as the row");
assert.match(styles, /accounts-workloads-oppty-grid th:nth-child\(5\)[\s\S]*position:\s*static/,
  "Target Quarter scrolls normally while only opportunity identity columns remain sticky");
assert.match(page, /const dealSaveLock = useRef\(createOpportunitySaveLock\(\)\)\.current;/,
  "Opportunity save owns a synchronous mutation lock");
assert.match(page, /const beginDealEdit[\s\S]*?if \(!canWrite \|\| dealSaveLock\.isLocked\(\)\) return;/);
assert.match(page, /const updateDealDraft[\s\S]*?if \(dealSaveLock\.isLocked\(\)\) return;/);
assert.match(page, /const addDeal[\s\S]*?if \(dealSaveLock\.isLocked\(\)\) return;/);
assert.match(page, /const cancelDeal[\s\S]*?if \(dealSaveLock\.isLocked\(\)\) return;/);
assert.match(saveDealHandler, /if \(dealSaveLock\.isLocked\(\)\) return;[\s\S]*dealSaveLock\.tryStart\(changedDrafts\)[\s\S]*finally \{\s*dealSaveLock\.release\(\);\s*setSaving\(false\);/,
  "save blocks duplicate submission immediately and releases the lock on success or failure");

console.log("Accounts & Workloads hierarchy editable UI contracts passed");
