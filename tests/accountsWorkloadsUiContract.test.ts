import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/components/content/AccountsWorkloadsPage.tsx", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");
const unsavedDeleteHandler = page.slice(page.indexOf("const removeUnsavedSelected"), page.indexOf("const deleteSelected"));
const deleteHandler = page.slice(page.indexOf("const deleteSelected"), page.indexOf("const cancelAllDrafts"));
const permanentDeleteHandler = page.slice(page.indexOf("const confirmPermanentDelete"), page.indexOf("const deleteSelected"));
const cancelHandler = page.slice(page.indexOf("const cancelAllDrafts"), page.indexOf("const planWriteFor"));
const saveAwHandler = page.slice(page.indexOf("const saveAwDrafts"), page.indexOf("const toggleHighlight"));
const saveDealHandler = page.slice(page.indexOf("const saveDealDrafts"), page.indexOf("const dealDisplay"));
const confirmDealDeleteHandler = page.slice(page.indexOf("const confirmDealDelete"), page.indexOf("const requestDealDelete"));

assert.match(page, /type AwField = "account" \| "workload" \| "plan" \| "lastUpdated" \| "notes"/);
assert.match(page, /onDblClick={[\s\S]*beginAwEdit/,
  "saved AW cells remain display-first and enter edit mode only on double-click");
assert.match(page, /field === "lastUpdated" \|\| field === "notes"/,
  "Latest Update and Notes retain multiline editors");
assert.match(page, /accounts-workloads-ellipsis/);
assert.match(page, /showImmediateTooltip[\s\S]*createPortal\([\s\S]*accounts-workloads-latest-tooltip/,
  "truncated AW and Opportunity text uses the same immediate portaled tooltip");
assert.doesNotMatch(page, /\.title\s*=/,
  "AW text does not also install a delayed native title tooltip");
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
assert.match(cancelHandler, /setHierarchy\(baseline\)/,
  "AW Cancel restores the complete last-saved hierarchy without depending on row selection");
assert.match(cancelHandler, /setDealDrafts\(new Map\(\)\)/);
assert.match(cancelHandler, /setPendingDeleteWorkloadIds\(new Set\(\)\)/);
assert.match(cancelHandler, /setFxRateValue\(savedFxRateValue\)/,
  "AW Cancel clears opportunity drafts, delete drafts and unsaved FX state together");
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
assert.match(page, /const changedDrafts = \[\.\.\.dealDrafts\.values\(\)\]\.filter\(isDealDraftChanged\)[\s\S]*const drafts = dealSaveLock\.tryStart\(changedDrafts\)[\s\S]*const dealWrites = drafts\.map[\s\S]*deals: dealWrites/,
  "one opportunity Save sends every changed opportunity draft in one atomic hierarchy request");
assert.match(page, /dealWrite\(draft\.deal, draft\.workloadId, draft\.original, draft\.key\)/,
  "every submitted opportunity write carries its stable draft key as clientId");
assert.match(page, /applyConfirmedDeals\([\s\S]*clearSubmittedDealDrafts\(drafts\)/,
  "successful opportunity batch save merges confirmed deals without discarding unrelated AW drafts");
assert.match(saveDealHandler, /saveAccountsWorkloadsHierarchyWithResults[\s\S]*correlateLegacyOpportunityResults[\s\S]*validateConfirmedOpportunityWrites[\s\S]*fetchAccountsWorkloadsHierarchy\(\{[\s\S]*validateConfirmedOpportunityWrites[\s\S]*clearSubmittedDealDrafts\(drafts\)/,
  "POST validation and correlation are followed by an authoritative GET before drafts are released");
assert.match(page, /const isDefiniteWriteRejection[\s\S]*\[400, 401, 403, 404, 409, 422\]\.includes\(error\.status\)/,
  "only explicit non-ambiguous client rejections are retryable; timeout-like and server responses remain pending");
assert.match(saveDealHandler, /isDefiniteWriteRejection\(requestError\)[\s\S]*dealSaveLock\.markAwaitingConfirmation\(\)[\s\S]*setPendingDealConfirmation/,
  "ambiguous Opportunity saves enter pending confirmation");
assert.match(saveDealHandler, /drafts: Object\.freeze\(\[\.\.\.drafts\]\)[\s\S]*submittedWrites: Object\.freeze/,
  "an uncertain save preserves both the drafts and submitted snapshot");
assert.match(saveDealHandler, /저장 확인 대기[\s\S]*Save is blocked until GET reconciliation succeeds/,
  "an uncertain save with recoverable correlation is visibly separated and cannot be retried as a POST");
assert.match(saveDealHandler, /hasUnrecoverableNewDealCorrelationLoss\(pendingConfirmation\)[\s\S]*일반 재조회로 해당 행을 안전하게 연결할 수 없습니다[\s\S]*입력은 보존되고 재전송은 차단됩니다[\s\S]*관리자 확인이 필요합니다/,
  "a lost new-row correlation preserves input without promising that a general GET can unlock it");
assert.doesNotMatch(saveDealHandler, /setDealDrafts\(new Map\(\)\)/,
  "a completed request cannot clear opportunity drafts created or changed while it was in flight");
assert.match(page, /const updateDealDraft[\s\S]*if \(dealSaveLock\.isLocked\(\)\) return/,
  "opportunity draft mutation is blocked immediately while a save is in flight");
assert.match(page, /cancelDeal\(activeDraft\.key\)/,
  "an opportunity row Cancel is isolated to that opportunity draft");
assert.match(cancelHandler, /setError\(""\)[\s\S]*setSaveErrors\(\[\]\)/,
  "global Cancel clears stale validation feedback after restoring saved state");
assert.match(page, /aria-label="Dismiss error"[\s\S]*setError\(""\)[\s\S]*setSaveErrors\(\[\]\)/,
  "validation feedback has an accessible dismiss action without changing validation rules");
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
assert.doesNotMatch(page, /accounts-workloads-toolbar[^"\n]*consumption-range-bar/,
  "AW toolbar does not inherit Consumption label layout rules");
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
assert.match(page, /field === "revenueType"[\s\S]*value=\{value\}[\s\S]*opportunityRevenueTypeOptions\(value\)/,
  "Revenue Type editing selects a canonical or preserved custom value without duplicate defaults");
assert.match(styles, /accounts-workloads-child-row > td \{[^}]*padding: 14px 14px 14px 62px/,
  "expanded opportunity boxes keep equal top and bottom spacing");
const awScrollFrame = styles.match(
  /\.accounts-workloads-grid-wrap\.accounts-workloads-grid-wrap--compact\s*\{([^}]*)\}/,
)?.[1] ?? "";
assert.match(awScrollFrame, /overflow:\s*auto/,
  "the bounded AW table owns scrolling so the page frame and last row are not clipped by the footer");
assert.match(awScrollFrame, /min-height:\s*0/);
assert.match(awScrollFrame, /flex:\s*1\s+1\s+auto/);
assert.match(styles, /accounts-workloads-grid\.accounts-workloads-aw-grid\s*\{[^}]*min-width:\s*0/,
  "the high-specificity legacy AW minimum width is reset");
assert.match(styles, /accounts-workloads-grid\.accounts-workloads-aw-grid th,[\s\S]*accounts-workloads-grid\.accounts-workloads-aw-grid td\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*none/,
  "legacy per-column minimum widths cannot force horizontal overflow");
assert.match(styles, /accounts-workloads-aw-grid\s*>\s*thead[\s\S]*position:\s*static/,
  "AW-only layout resets are scoped to direct parent-table cells and cannot leak into nested Opportunities");
assert.match(styles, /accounts-workloads-aw-grid[\s\S]*table-layout:\s*fixed[\s\S]*width:\s*100%/,
  "AW columns fit the available width rather than being clipped");
assert.match(page, /data-deal-draft-key[\s\S]*is-editing-cell input,[\s\S]*is-editing-cell textarea,[\s\S]*is-editing-cell select/,
  "opportunity inputs and textareas receive one-time row-scoped focus");
assert.doesNotMatch(page, /onFocus=\{focusToEnd\}/,
  "focus handlers do not repeatedly force the caret after the initial edit focus");
assert.match(page, /const changed = !baselineWorkload \|\| value !== original/,
  "all cells in a new AW row, including a blank Plan Number, retain draft styling");
assert.match(page, /element\.scrollWidth <= element\.clientWidth[\s\S]*setLatestUpdateTooltip\(null\)/,
  "ellipsis cells expose the full value only when truncated");
assert.match(page, /field === "plan"\s*\? \{[\s\S]*plans:/,
  "only the Plan editor can update the Plan value; Account edits cannot fall through to it");
assert.match(page, /selectedCount > 0 && !editCell && !dirty/,
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
assert.match(page, /class="accounts-workloads-fx__button"[\s\S]*Exchange Rate \(USD to KRW\)[\s\S]*accounts-workloads-fx-popover[\s\S]*Apply[\s\S]*Cancel/,
  "the exchange-rate button retains its Apply and Cancel popover behavior");
assert.match(page, /class="accounts-workloads-table-summary"[\s\S]*\{hierarchy\.accounts\.length\} accounts[\s\S]*class="accounts-workloads-fx"[\s\S]*\{loading \? \(/,
  "account count and the compact exchange-rate control share one summary row above the table state");
assert.match(page, /class="accounts-workloads-include-deleted"[\s\S]*type="checkbox"[\s\S]*<span>Include Deleted<\/span>/,
  "Include Deleted keeps its checkbox and text in one explicit inline label structure");
assert.match(page, /<colgroup class="accounts-workloads-oppty-columns">[\s\S]*accounts-workloads-oppty-column--name[\s\S]*accounts-workloads-oppty-column--id[\s\S]*accounts-workloads-oppty-column--revenue/,
  "opportunity identity and scrolling columns have explicit widths");
assert.match(styles, /\.accounts-workloads-include-deleted\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*white-space:\s*nowrap/,
  "Include Deleted cannot wrap its label below the checkbox");
assert.match(styles, /\.accounts-workloads-oppty-grid\s*\{[^}]*table-layout:\s*fixed/,
  "opportunity column width and sticky offsets use one deterministic fixed layout");
assert.match(styles, /\.accounts-workloads-oppty-grid th:nth-child\(1\),[\s\S]*position:\s*sticky/,
  "the final cascade explicitly keeps Oppty Name and Oppty ID sticky");
assert.match(styles, /\.accounts-workloads-oppty-grid td:nth-child\(n \+ 3\)\s*\{[^}]*position:\s*relative/,
  "scrolling opportunity cells establish their own containing block for the changed-cell marker");
assert.match(styles, /\.accounts-workloads-aw-grid \.accounts-workloads-oppty-grid td:nth-child\(n \+ 3\)\s*\{[^}]*z-index:\s*auto/,
  "leaked parent-table z-index cannot place scrolling opportunity cells above the two sticky identity columns");
assert.match(styles, /\.accounts-workloads-page\.accounts-hierarchy-page\s*\{[^}]*height:\s*calc\([^}]*overflow:\s*hidden/,
  "the AW page remains a bounded flex frame so its table owns scrolling above the footer");
assert.match(page, /changedAccountIds\.has\(account\.id\) && !account\.name\.trim\(\)/,
  "blank Account values are rejected before any save request is sent");
assert.match(page, /aria-required=\{field === "account" \|\| field === "workload" \? "true" : undefined\}/,
  "required AW editors expose their requirement to assistive technology");
assert.match(styles, /\.accounts-workloads-aw-grid td\.is-unsaved-cell::after,[\s\S]*\.accounts-workloads-oppty-grid td\.is-unsaved-cell::after\s*\{[^}]*bottom:\s*0[^}]*height:\s*3px[^}]*left:\s*\.35rem[^}]*right:\s*\.35rem/,
  "AW and Opportunity draft markers use the KPI cell-bottom marker principle");
assert.doesNotMatch(page, /is-unsaved-content/,
  "changed-cell markers are not attached to inner inline wrappers");
assert.doesNotMatch(styles, /accounts-workloads-cell-content\.is-unsaved-content/);
assert.match(page, /showImmediateTooltip\(event\.currentTarget, value, true\)/,
  "Latest Update and Notes use the rendered element overflow gate");
assert.match(page, /onlyIfClipped && element\.scrollWidth <= element\.clientWidth/,
  "tooltip clipping is determined from scrollWidth and clientWidth");
assert.match(page, /createPortal\([\s\S]*accounts-workloads-toast[\s\S]*document\.body/,
  "informational notices render through a body-level toast portal");
assert.match(styles, /\.accounts-workloads-toast\s*\{[^}]*pointer-events:\s*none[^}]*position:\s*fixed/,
  "the auto-dismiss toast is out of document flow and cannot cover interactive hit targets");
assert.match(page, /if \(!notice\) return;[\s\S]*window\.setTimeout\(\(\) => setNotice\(""\), 2600\)/,
  "the fixed informational toast auto-dismisses");
assert.match(saveAwHandler, /const saved = await saveAccountsWorkloadsHierarchy\(request\)[\s\S]*setBaseline\(withoutArchived\)[\s\S]*setNotice\(/,
  "AW save success appears only after the authoritative save response is adopted");
assert.match(styles, /\.accounts-workloads-oppty-grid thead th:nth-child\(-n \+ 2\)\s*\{[^}]*background:\s*#f4f6f8/,
  "sticky Opportunity identity headers share the other header background");
assert.match(page, /type="button"[\s\S]*class="accounts-workloads-add-aw"[\s\S]*onClick=\{addAw\}/,
  "Add Account & Workload cannot submit the search form");
assert.match(page, /\(field === "account" \|\| field === "workload"\) && \([\s\S]*accounts-workloads-required-marker/,
  "AW required fields are identified where values are entered");
assert.match(page, /Oppty Name[\s\S]*?<span class="accounts-workloads-required-marker"/,
  "Opportunity Name is visibly identified as required");
assert.match(styles, /\.accounts-workloads-header\s*\{[^}]*z-index:\s*40/,
  "the header establishes a stacking context above sticky table headers");
assert.match(styles, /\.accounts-workloads-fx-popover\s*\{[^}]*z-index:\s*50/,
  "the complete exchange-rate popover stays above table content");
assert.match(page, /const dealSaveLock = useRef\(createOpportunitySaveLock\(\)\)\.current;/,
  "Opportunity save owns a synchronous mutation lock");
assert.match(page, /const beginDealEdit[\s\S]*?if \(!canWrite \|\| dealSaveLock\.isLocked\(\)\) return;/);
assert.match(page, /const updateDealDraft[\s\S]*?if \(dealSaveLock\.isLocked\(\)\) return;/);
assert.match(page, /const addDeal[\s\S]*?if \(dealSaveLock\.isLocked\(\)\) return;/);
assert.match(page, /const cancelDeal[\s\S]*?if \(dealSaveLock\.isLocked\(\)\) return;/);
assert.match(saveDealHandler, /if \(dealSaveLock\.isLocked\(\)\) return;[\s\S]*dealSaveLock\.tryStart\(changedDrafts\)[\s\S]*finally \{\s*dealSaveLock\.release\(\);\s*setSaving\(false\);/,
  "save blocks duplicate submission immediately and releases the lock on success or failure");
assert.match(page, /저장 확인 대기/,
  "unknown POST outcomes are presented as a distinct save-confirmation-pending state");
assert.match(saveDealHandler, /markAwaitingConfirmation/,
  "a lost or malformed POST response keeps the synchronous resend gate locked");
assert.match(page, /const reconcilePendingDealSave[\s\S]*fetchAccountsWorkloadsHierarchy[\s\S]*validateConfirmedOpportunityWrites[\s\S]*confirmReconciled/,
  "only an authoritative GET reconciliation can release a pending opportunity save");
assert.match(page, /pendingDealConfirmation[\s\S]*submittedWrites/,
  "the submitted write snapshot is retained in memory for later GET reconciliation");
assert.match(page, /const confirmDealDelete[\s\S]*fetchAccountsWorkloadsHierarchy[\s\S]*validateConfirmedOpportunityWrites/,
  "delete success requires an authoritative GET showing target absence");
assert.match(page, /const reconcilePendingDealSave[\s\S]*includeDeletedDeals:\s*false[\s\S]*validateConfirmedOpportunityWrites/,
  "pending DELETE reconciliation excludes soft-deleted rows before checking target absence");
assert.match(confirmDealDeleteHandler, /dealSaveLock\.tryStart\(submittedDeletes\)[\s\S]*saveAccountsWorkloadsHierarchyWithResults[\s\S]*isDefiniteWriteRejection\(requestError\)[\s\S]*markAwaitingConfirmation[\s\S]*setPendingDealConfirmation/,
  "an uncertain Opportunity delete preserves its submitted snapshot and blocks duplicate DELETE posts");
assert.match(page, /hasUnrecoverableNewDealCorrelationLoss[\s\S]*originalId === null[\s\S]*result\.clientId === write\.clientId/,
  "a new row whose correlation was lost is identified as not recoverable by ordinary GET matching");
assert.match(page, /저장 결과 확인 불가 — 관리자 확인 필요/,
  "the UI does not promise GET recovery when a new-row correlation was lost");
assert.doesNotMatch(page.slice(page.indexOf("const confirmDealDelete"), page.indexOf("const requestDealDelete")), /setDealDrafts\(new Map\(\)\)/,
  "deleting selected opportunities cannot erase unrelated drafts");

console.log("Accounts & Workloads hierarchy editable UI contracts passed");
