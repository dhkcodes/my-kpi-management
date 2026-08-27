import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.resolve("src/components/content/KpiSpreadsheetPage.tsx"), "utf8");
const api = fs.readFileSync(path.resolve("src/data/kpiSpreadsheetApi.ts"), "utf8");
const contract = fs.readFileSync(path.resolve("src/data/kpiSpreadsheet.ts"), "utf8");
const model = fs.readFileSync(path.resolve("src/data/kpiActivityGridModel.ts"), "utf8");
const main = fs.readFileSync(path.resolve("src/main.js"), "utf8");
const content = fs.readFileSync(path.resolve("src/components/content/index.tsx"), "utf8");
const app = fs.readFileSync(path.resolve("src/components/app.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("src/styles/app.css"), "utf8");
const workspace = fs.readFileSync(path.resolve("src/data/kpiWorkspaceDefinition.ts"), "utf8");

assert.match(main, /waitSeconds:\s*(?:[3-9]\d|\d{3,})/, "Tailnet JET loads must tolerate network latency");
assert.doesNotMatch(page, /ojdatagrid|RowDataGridProvider|MutableArrayDataProvider|oj-data-grid|loadSkeletons|fillViewport/,
  "KPI Activities must not retain JET Data Grid or viewport lifecycle code");
assert.match(page, /import "ojs\/ojdatetimepicker"/);
assert.match(page, /import "ojs\/ojdialog"/);
assert.match(page, /import "ojs\/ojprogress-circle"/);
assert.match(page, /const \[pageLoading, setPageLoading\] = useState\(true\)/, "KPI Activities owns an explicit initial loading state");
assert.match(page, /setPageLoading\(true\)[\s\S]*Promise\.all\([\s\S]*finally\([\s\S]*setPageLoading\(false\)/, "KPI Activities loading follows its authoritative API request lifecycle");
assert.match(page, /pageLoading[\s\S]*aria-label="Loading KPI Activities"[\s\S]*Loading KPI Activities data/, "KPI Activities mirrors the Accounts & Workloads indeterminate loading view");
assert.match(page, /<table[^>]*class="kpi-activities-table"/);
assert.match(page, /<tr key=\{`\$\{tableScopeKey\}:\$\{row\.id\}`\} data-kpi-row-id=\{row\.id\}/);
assert.match(page, /<td key=\{field\.key\} class=\{classes\} data-kpi-grid-row=\{row\.id\} data-kpi-grid-field=\{field\.key\}/);
assert.doesNotMatch(page, /onojBeforeEdit|onojBeforeEditEnd|_WIDGET_INSTANCE|_ojBridge|resizeColWidth/);
assert.match(page, /inputRef\.current\.indeterminate = selectedCount > 0 && !allSelected/,
  "the native select-all control must reflect the page-owned selection model");
assert.match(page, /<th class="kpi-grid-column-header kpi-selector-cell" scope="col" tabIndex=\{0\}[\s\S]*?<div class="kpi-select-all-header"/,
  "Select All must share the data-column header surface and keep its checkbox in the centered wrapper");
assert.match(page, /selected=\{selectedIds\.has\(row\.id\)\}/,
  "native row selectors must be controlled by scoped selection state");

assert.match(model, /"view" \| "editing" \| "dirty" \| "saving" \| "cancelling"/);
assert.match(model, /generation:\s*state\.generation \+ 1/);
assert.match(page, /requestGenerationRef\.current \+= 1;[\s\S]*setQuery\(""\);[\s\S]*setOptions\(\[\]\);[\s\S]*state\.generation/,
  "each edit generation resets workload-local query and option state");
assert.match(page, /data-kpi-single-editor/);
assert.match(page, /if \(saving \|\| editStateRef\.current\.phase === "saving"/);
assert.match(page, /event\.key === "Enter"/);
assert.match(page, /event\.key === "Escape"/);
assert.match(page, /event\.key === "Tab"/);
assert.match(page, /tabIndex=\{0\}[\s\S]*onKeyDown[\s\S]*onKeyUp[\s\S]*beginEditing\(row, field, event\.currentTarget\)/);
assert.match(page, /aria-controls=\{`kpi-workload-options-[\s\S]*aria-activedescendant=/);
assert.match(page, /aria-selected=\{activeWorkloadIndex ===/);
assert.match(page, /document\.addEventListener\("pointerdown", finishOnOutsidePointer, true\)/);
assert.match(page, /editRowSnapshotRef\.current/);
assert.match(page, /reconcileDraft\(current, snapshot\)/);
assert.match(page, /isKpiFieldChanged/);

assert.match(page, /<textarea/);
assert.match(contract, /field\("title", "SR Description", "textarea"\)/);
assert.match(contract, /H:\s*\[manageTime, field\("title", "Content", "textarea"\)/);
assert.match(styles, /\.kpi-cell-editor-overlay--textarea\s*\{[^}]*min-height:\s*8rem/);
assert.match(styles, /\.kpi-cell-editor-control--textarea\s*\{[^}]*min-height:\s*8rem[^}]*overflow:\s*auto[^}]*padding:\s*\.75rem/);
assert.match(page, /field\.type === "date" \? " kpi-cell-editor-overlay--date"/, "Delivery Date marks the outer editor surface for date-specific composition");
assert.match(styles, /\.kpi-cell-editor-overlay--date\s*\{[^}]*border:\s*0[^}]*box-shadow:\s*none[^}]*padding:\s*0/, "Delivery Date keeps the JET input border and removes only the duplicate outer overlay frame");
assert.match(page, /function KpiClippedCellText[\s\S]*scrollWidth > element\.clientWidth[\s\S]*scrollHeight > element\.clientHeight/, "the common KPI cell renderer opens Full Text only for actually clipped single-line or multiline text");
assert.match(page, /createPortal[\s\S]*kpi-clipped-cell-tooltip/, "KPI Full Text is portaled outside table overflow containers");
assert.match(page, /field\.type === "textarea" \? <KpiClippedCellText[\s\S]*: <KpiClippedCellText/, "textarea and ordinary KPI fields share one clipped-text renderer");
assert.match(styles, /\.kpi-clipped-cell-tooltip\s*\{[^}]*max-width:\s*min\(32rem, calc\(100vw - 1rem\)\)[^}]*pointer-events:\s*none[^}]*position:\s*fixed[^}]*z-index:/, "KPI Full Text is multiline, viewport-constrained, and cannot intercept link clicks");
assert.doesNotMatch(page, /cellOptions[\s\S]{0,400}height:152px/,
  "the editor overlay owns multiline height");

assert.match(page, /id={`kpi-workload-launcher-\$\{state\.generation\}`}/);
assert.match(page, /getBusyContext\(\)\.whenReady\(\)\.then\(\(\) => window\.requestAnimationFrame/);
assert.match(page, /launcher\.getBoundingClientRect\(\)/);
assert.match(page, /launcherRect\.width <= 0 \|\| launcherRect\.height <= 0/);
assert.match(page, /of:\s*launcherSelector/);
assert.match(page, /collision:\s*"none"/,
  "workload results must remain directly below the live launcher instead of flipping to an unrelated screen edge");
assert.match(page, /--kpi-workload-popup-max-height/,
  "below-launcher results must shrink to the remaining viewport height rather than opening at (0,0)");
assert.match(page, /onWorkload\(option\); onFinish\(\)/);
assert.match(page, />선택 안함</);
assert.doesNotMatch(page, /setTimeout\(openPopup/);

assert.match(page, /is-unsaved-cell/);
assert.match(page, /kpi-manage-time-reflected-row/);
assert.match(styles, /\.kpi-grid-cell\.is-unsaved-cell::after\s*\{[^}]*background:\s*var\(--kap-grid-draft-line\)[^}]*bottom:\s*0[^}]*height:\s*3px/);
assert.match(styles, /tr\.kpi-manage-time-reflected-row td[^}]*background:\s*var\(--kap-grid-kpi-reflected-bg\)/);
assert.match(page, /setDrafts\(\[\]\)/);

assert.match(page, /class="kpi-saving-dialog"/);
assert.match(page, /<oj-progress-circle[^>]*Saving KPI activities/);
assert.match(page, /cancelBehavior="none"/);
assert.match(page, /disabled=\{saving/);
assert.match(page, /Save changes/);
assert.match(page, /Discard changes/);
assert.match(page, /Keep editing/);
assert.match(page, /if \(drafts\.length === 0\) return/,
  "clean Cancel must leave without opening confirmation");

assert.match(page, /nextKpiSort/);
assert.match(page, /sortKpiActivityRows/);
assert.match(page, /class="kpi-grid-sort-button"/);
assert.match(page, /<th key=\{field\.key\} class="kpi-grid-column-header" scope="col" aria-sort=\{ariaSort\}/,
  "sort state belongs directly on the native column header");
assert.match(model, /if \(leftDraft !== rightDraft\) return leftDraft \? -1 : 1/,
  "new draft rows stay first under sorting");
assert.match(model, /fixedWidthFor/);
assert.match(model, /flexibleBudget/);
assert.match(model, /flexibleMinimumTotal[\s\S]*Math\.max\(flexibleMinimumTotal/,
  "flexible columns retain readable minimums while fixed-width fields remain stable");
assert.doesNotMatch(page, /new ResizeObserver/,
  "native table width calculation must not create a self-observing ResizeObserver loop");
assert.match(page, /window\.addEventListener\("resize", schedule\)/);
assert.match(page, /computeKpiColumnLayout\(fields, Math\.max\(0, host\.clientWidth - 1\)\)/,
  "column layout must use the border-excluded viewport with one pixel of collapse\/rounding safety");
assert.match(page, /<colgroup>[\s\S]*columnLayout\.widths\[field\.key\]/);
assert.match(styles, /\.kpi-activities-table-wrap\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/);
assert.match(styles, /\.kpi-activities-table\s*\{[^}]*min-width:\s*100%[^}]*width:\s*max-content/, "KPI tables fill the available panel while retaining horizontal overflow on narrow screens");
assert.match(page, /\}, \[activeTab, fields, pageLoading\]\);/, "column widths are recalculated after the loading view mounts the table host");
assert.match(page, /const fiscalYearChanged = loadedFiscalYearRef\.current !== fiscalYear[\s\S]*if \(fiscalYearChanged\)[\s\S]*setPageLoading\(true\)/, "same-FY post-save refresh keeps the mounted table and dialog host intact");
assert.match(page, /const settleDialogClosed = useCallback[\s\S]*await busyContext\.whenReady\(\)[\s\S]*dialog\.close\(\)[\s\S]*await busyContext\.whenReady\(\)/, "all chained KPI dialogs settle their JET BusyContext before another modal or route action starts");
assert.match(styles, /\.kpi-grid-sort-button\s*\{[^}]*color:\s*var\(--kap-grid-header-ink\)/,
  "KPI header titles use the calm slate token instead of red");
assert.match(styles, /\.kpi-content:has\(\.kpi-spreadsheet-page\)\s*\{[^}]*align-content:\s*start/);
assert.match(styles, /\.kpi-sheet-summary\[hidden\]\s*\{[^}]*display:\s*none/);
assert.doesNotMatch(styles, /\.kpi-activities-table-wrap\s*\{[^}]*min-height:/,
  "empty and one-row KPI tables must not reserve an artificial vertical spacer");
assert.match(page, /summaryLabel = salesSummary \? "Stage \/ ACR" : "Quarter Summary"/);
assert.match(page, /class="kpi-summary-toggle"[\s\S]*aria-controls=\{summaryId\}[\s\S]*aria-expanded=\{summaryExpanded\}/);
assert.match(page, /class="kpi-guide-toggle"[\s\S]*aria-controls=\{guideId\}[\s\S]*aria-expanded=\{guideExpanded\}/);
assert.match(page, /<span>KPI Guide<\/span>/);
assert.match(page, /activeGuide\?\.targetPerQuarter[\s\S]*activeGuide\?\.activity[\s\S]*activeGuide\?\.measuring/,
  "active KPI Guide content must include target, activity, and measurement contracts");
assert.match(content, /isKpiActivitiesRoute\(activeRoute\)[\s\S]*kpi-guide-entry-button/,
  "Fiscal Year KPI Guide entry must be limited to KPI Activities routes");
assert.match(page, /target\.closest\("\.oj-datepicker-popup"\)/);

assert.match(page, /const tableScopeKey = `\$\{fiscalYear\}:\$\{activeTab\}`/);
assert.match(page, /selectionByScope\[tableScopeKey\]/);
assert.match(page, /sortByScope\[tableScopeKey\]/);
assert.doesNotMatch(page, /key=\{tableScopeKey\}/, "KPI/FY transitions must not remount the native table");
assert.match(page, /data-kpi-row-selector=\{rowId\}/);
assert.match(page, /type="checkbox" aria-label="Select all KPI activities"/);
assert.match(page, /row\.manageTimeReflected \? "kpi-manage-time-reflected-row"/);

assert.match(page, /saveKpiRowsAtomic\(draftSnapshot\)/, "Save must submit all KPI drafts as one atomic operation");
assert.doesNotMatch(page, /Promise\.allSettled\(draftSnapshot\.map/, "row-by-row partial Save is forbidden");
assert.match(page, /sessionVersion\.current !== saveSession/);
assert.match(page, /sessionVersion\.current !== deleteSession \|\| sessionKeyRef\.current !== deleteSessionKey/,
  "delete completion must not mutate a replacement route or fiscal-year session");
assert.match(page, /setReloadVersion\(\(current\) => current \+ 1\)/);
assert.match(api, /workloadId/);
assert.match(page, /onNavigationGuardChange\(requestProtectedNavigation, drafts\.length > 0\)/);
assert.match(content, /onKpiNavigationGuardChange[\s\S]*onNavigationGuardChange=\{onKpiNavigationGuardChange\}/);
assert.match(app, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/);
assert.match(app, /if \(kpiGuard\) kpiGuard\(route\.pageTitle, navigate\)/);
assert.doesNotMatch(page, /window\.confirm/);
assert.match(page, /Save and Continue/);
assert.match(page, /Discard and Continue/);
assert.match(page, />Stay</);
assert.match(page, /Delete selected KPI activities/);

assert.match(page, /listKpiSummary/,
  "KPI workspace loads the strict summary API alongside rows and overview");
assert.doesNotMatch(page, /<th>Summary model<\/th>/, "KPI Performance removes the Summary model column");
assert.match(page, /<th>Q1<\/th><th>Q2<\/th><th>Q3<\/th><th>Q4<\/th>/,
  "KPI Performance exposes quarter-specific status columns");
assert.match(page, /portfolioQuarterStatuses\(displaySummary, row\.code, fiscalYear, asOf\)/,
  "KPI Performance derives each status from the FY-scoped authoritative target policy");
assert.match(styles, /\.kpi-status-badge--not-started\s*\{[^}]*background:\s*#f5f5f5[^}]*color:\s*#6f6f6f/,
  "future-quarter Not Started badges use an explicit neutral treatment");
assert.match(page, /Promise\.all\(\[listKpiRows\(fiscalYear\), listKpiOverview\(fiscalYear\), listKpiSummary\(fiscalYear\)\]\)/,
  "rows, overview, and summary share one FY-scoped refresh");
assert.match(page, /KPI activity row\(s\) saved atomically[\s\S]{0,600}await settleSavingDialogClosed\(\)[\s\S]{0,300}setReloadVersion\(\(current\) => current \+ 1\)/,
  "successful Save closes and settles the modal before a refresh can replace the page DOM");
assert.match(page, /KPI activity row\(s\) deleted[\s\S]{0,600}await settleSavingDialogClosed\(\)[\s\S]{0,300}setReloadVersion\(\(current\) => current \+ 1\)/,
  "Delete closes and settles the modal before refreshing authoritative data");
assert.doesNotMatch(page, /KPI_QUARTER_COUNT_TARGETS/, "B and other count targets come from summary API policy");
assert.match(page, /<h3 id="kpiQuarterSummary">Delivery Quarter Count<\/h3>/,
  "count statistics are named for Delivery Date quarters");
assert.match(page, /const showSummary = activeTab !== "Overview"/,
  "A, F, and H expose reflected Delivery Date quarter summaries");
assert.doesNotMatch(page, /C1 \+ C2 combined|Workshops \/ POCs/,
  "the combined calculation stays internal and does not restore removed C1/C2 copy");
assert.match(`${page}\n${workspace}`, /Show and discover workshops/,
  "C1 uses the approved title across the activity workspace");
assert.match(app, /listKpiSummary\(fiscalYear\)/,
  "Home loads KPI statistics from the live summary API");
assert.match(app, /buildLiveFiscalYearDataset/,
  "Home adapts the authoritative API summary instead of synthetic KPI actuals");
assert.match(content, /kpiDatasetLoading[\s\S]*KPI Overview data/, "Home exposes KPI API loading state");
assert.doesNotMatch(content, /showHome[\s\S]{0,7000}dataset\.overviewRows/,
  "Home no longer renders synthetic KPI overview actuals");
assert.match(page, /role="progressbar"/);
assert.match(page, /Sales Stage ACR[\s\S]*USD K/);

assert.doesNotMatch(page, /KPI categories|Count-based|Stage\/ACR-based/, "legacy low-value KPI Overview cards are removed");
for (const label of ["Quarterly Target Achievement", "Reflected Completion", "Overdue Pending", "Date Integrity Exceptions"]) {
  assert.ok(page.includes(label), `${label} card must be present`);
}
assert.match(page, /buildKpiActivitiesOverview\(activeRows, fiscalYear, activitySummary, asOf\)/,
  "Overview metrics use FY-scoped rows and the authoritative target policy");
assert.match(page, /summary=\{displaySummary\} tab=\{activeTab\}/,
  "detail quarter summaries use the same FY-valid Delivery Date scope as KPI Performance");
assert.match(page, /portfolioQuarterStatuses\(displaySummary, row\.code, fiscalYear, asOf\)/,
  "KPI Performance excludes invalid and out-of-FY Delivery Dates");
assert.match(page, /filterKpiOverviewRows\(activeRows, fiscalYear, activitySummary, asOf, overviewFilter\)/,
  "clickable cards drive the filtered Activity list");
assert.match(page, /Missing date[\s\S]*Invalid date[\s\S]*Outside selected FY/,
  "Date Integrity details distinguish every exception type");
assert.match(page, /Solution Design/);
assert.match(page, /Solution Proposal/);
assert.match(page, /Solution Deployment/);
assert.match(page, /kpi-quarter-status-label--achieved/);
assert.match(page, /kpi-quarter-status-label--not-achieved/);
assert.match(page, /kpi-quarter-status-label--in-progress/);
assert.match(page, /kpi-quarter-status-label--not-started/);
assert.doesNotMatch(page, />Edit</);
assert.doesNotMatch(page, />Refresh</);
assert.match(page, /reflectedAction &&[\s\S]*aria-label=\{reflectedAction\.label\}[\s\S]*>\{reflectedAction\.label\}<\/button>/,
  "selection toolbar exposes one context-aware reflected action");
assert.doesNotMatch(page, /onClick=\{\(\) => applyManaged\(true\)\}[\s\S]{0,180}onClick=\{\(\) => applyManaged\(false\)\}/,
  "separate reflected and not-reflected buttons are removed");
assert.match(page, /class="kpi-grid-column-header kpi-selector-cell"[\s\S]{0,900}onClick=\{toggleVisibleSelectionFromCell\}/,
  "the whole selector header cell toggles all visible rows");
assert.match(page, /class="kpi-grid-cell kpi-selector-cell"[\s\S]{0,900}onClick=\{\(event\) => toggleRowSelectionFromCell\(event, row\.id\)\}/,
  "the whole row selector cell toggles its row");
assert.match(page, /event\.target instanceof HTMLInputElement/,
  "native checkbox bubbling is ignored to prevent double toggles");
assert.match(page, /event\.key !== "Enter" && !\[" ", "Space", "Spacebar"\]\.includes\(event\.key\)/,
  "selector cell keyboard contract supports Enter and Space");
assert.match(page, /aria-label=\{row\.manageTimeReflected \? "Reflected in internal system" : "Not reflected in internal system"\}/,
  "cells expose accessible final-reflection status");
assert.match(page, /kpi-reflected-status-badge/, "cells use a composed Redwood-aligned status badge");
assert.doesNotMatch(page, /kpi-managed-status-icon|>✓<|>○</, "legacy text glyph status icons are removed");
assert.match(styles, /\.kpi-reflected-status-badge\s*>\s*\[class\*="oj-ux-ico-"\]\s*\{[^}]*align-items:\s*center[^}]*display:\s*inline-flex[^}]*line-height:\s*1/,
  "Reflected and Pending icons align vertically beside their text");
assert.match(styles, /\.kpi-reflected-status-badge\s*>\s*span:last-child\s*\{[^}]*align-items:\s*center[^}]*display:\s*inline-flex[^}]*line-height:\s*1/,
  "status text shares the icon's centered inline layout without changing badge height");
assert.match(styles, /\.kpi-grid-cell\s*>\s*\.kpi-reflected-status-badge\s*\{[^}]*display:\s*inline-flex/,
  "the badge selector overrides the generic KPI cell child block layout");
assert.doesNotMatch(page, /<select[^>]*kpi-cell-editor-control[^>]*>[\s\S]{0,600}<option[^>]*>Pending<\/option>[\s\S]{0,300}<option[^>]*>Reflected<\/option>/,
  "Managed cells must not expose the old select editor");
assert.doesNotMatch(page, /Fiscal Year for new KPI Activity|kpi-new-activity-fiscal-year|updateNewActivityFiscalYear/,
  "Add KPI Activity has no duplicate Fiscal Year control");
assert.doesNotMatch(page, /kpi-spreadsheet-page__fiscal-year|aria-label="Selected fiscal year"/,
  "KPI Activities detail headers omit the redundant read-only Fiscal Year panel");
assert.doesNotMatch(contract, /B:\s*\[\.\.\.related, targetQuarter/,
  "B does not expose Target Quarter");
assert.doesNotMatch(contract, /C1:\s*\[\.\.\.related, targetQuarter/,
  "C1 does not expose Target Quarter");
assert.doesNotMatch(contract, /C2:\s*\[\.\.\.related, targetQuarter/,
  "C2 does not expose Target Quarter");
assert.match(contract, /field\("targetQuarter", "Target", "targetPeriod"\)/,
  "D1 exposes a fiscal-year-qualified target-period field");
assert.match(page, /field\.type === "targetPeriod"\s*\?\s*getTargetPeriodOptions\(fiscalYear\)/,
  "D1 reuses the shared FY-window option generator");
assert.match(api, /targetFiscalYear:\s*row\.kpiCode === "D1"/,
  "D1 save payload preserves the selected target fiscal year separately from its quarter");

assert.match(styles, /--kap-grid-header-bg:\s*#eef2f5/);
assert.match(styles, /--kap-grid-header-ink:\s*#334155/);
assert.match(styles, /--kap-grid-cell-bg:\s*#fff/);
assert.match(styles, /--kap-grid-border:\s*#ebe7e3/);
assert.match(styles, /--kap-grid-selected-bg:\s*#fffaf8/);
assert.match(styles, /--kap-grid-reflected-bg:\s*#fff8e5/);
assert.match(styles, /--kap-grid-kpi-reflected-bg:\s*#edf7f4/);
assert.match(styles, /--kap-grid-draft-bg:\s*#fff7ed/);
assert.match(styles, /--kap-grid-draft-line:\s*#b3366f/);
assert.match(styles, /\.accounts-workloads-grid th[^}]*background:\s*var\(--kap-grid-header-bg\)/,
  "Accounts headers consume the shared grid header token");
assert.match(styles, /\.kpi-grid-column-header[^}]*background:\s*var\(--kap-grid-header-bg\)/,
  "KPI headers consume the Accounts-aligned grid header token");
assert.match(styles, /tr\.kpi-manage-time-reflected-row td[^}]*background:\s*var\(--kap-grid-kpi-reflected-bg\)/,
  "KPI Reflected rows use the calm teal reflection surface token");
assert.match(styles, /\.accounts-workloads-grid td\.is-unsaved-cell::after[^{]*\{[^}]*background:\s*var\(--kap-grid-draft-line\)[^}]*height:\s*3px/,
  "Accounts drafts expose the shared pink 3px line");
assert.match(styles, /\.kpi-grid-cell\.is-unsaved-cell::after[^}]*background:\s*var\(--kap-grid-draft-line\)[^}]*height:\s*3px/,
  "KPI drafts expose the same pink 3px line");

assert.match(page, /const closed = new Promise<void>\(\(resolve\) => dialog\.addEventListener\("ojClose"/,
  "dialog cleanup waits for the real JET ojClose lifecycle event");
assert.match(page, /if \(!await settleDialogClosed\(navigationDialogRef\.current\)\)[\s\S]*Navigation was cancelled[\s\S]*return/,
  "navigation must abort and report when the JET dialog cannot settle closed");
assert.match(page, /if \(!await settleDialogClosed\(deleteDialogRef\.current\)\)[\s\S]*Delete was cancelled[\s\S]*return/,
  "Delete must abort and report when the JET dialog cannot settle closed");

console.log("kpiActivityUiContract tests passed");
