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

assert.match(main, /waitSeconds:\s*(?:[3-9]\d|\d{3,})/, "Tailnet JET loads must tolerate network latency");
assert.doesNotMatch(page, /ojdatagrid|RowDataGridProvider|MutableArrayDataProvider|oj-data-grid|loadSkeletons|fillViewport/,
  "KPI Activities must not retain JET Data Grid or viewport lifecycle code");
assert.match(page, /import "ojs\/ojdatetimepicker"/);
assert.match(page, /import "ojs\/ojdialog"/);
assert.match(page, /import "ojs\/ojprogress-circle"/);
assert.match(page, /<table[^>]*class="kpi-activities-table"/);
assert.match(page, /<tr key=\{`\$\{tableScopeKey\}:\$\{row\.id\}`\} data-kpi-row-id=\{row\.id\}/);
assert.match(page, /<td key=\{field\.key\} class=\{classes\} data-kpi-grid-row=\{row\.id\} data-kpi-grid-field=\{field\.key\}/);
assert.doesNotMatch(page, /onojBeforeEdit|onojBeforeEditEnd|_WIDGET_INSTANCE|_ojBridge|resizeColWidth/);
assert.match(page, /inputRef\.current\.indeterminate = selectedCount > 0 && !allSelected/,
  "the native select-all control must reflect the page-owned selection model");
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
assert.match(styles, /\.kpi-grid-cell\.is-unsaved-cell::after\s*\{[^}]*background:\s*#d9438f[^}]*bottom:\s*0[^}]*height:\s*3px/);
assert.match(styles, /tr\.kpi-manage-time-reflected-row td[^}]*background:\s*#eaf4ec/);
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
assert.match(page, /computeKpiColumnLayout\(fields, host\.getBoundingClientRect\(\)\.width\)/);
assert.match(page, /<colgroup>[\s\S]*columnLayout\.widths\[field\.key\]/);
assert.match(styles, /\.kpi-activities-table-wrap\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/);
assert.match(styles, /\.kpi-grid-sort-button\s*\{[^}]*color:\s*#8b3a2f/);

assert.match(page, /const tableScopeKey = `\$\{fiscalYear\}:\$\{activeTab\}`/);
assert.match(page, /selectionByScope\[tableScopeKey\]/);
assert.match(page, /sortByScope\[tableScopeKey\]/);
assert.doesNotMatch(page, /key=\{tableScopeKey\}/, "KPI/FY transitions must not remount the native table");
assert.match(page, /data-kpi-row-selector=\{rowId\}/);
assert.match(page, /type="checkbox" aria-label="Select all KPI activities"/);
assert.match(page, /row\.manageTimeReflected \? "kpi-manage-time-reflected-row"/);

assert.match(page, /Promise\.allSettled\(draftSnapshot\.map/);
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

assert.match(page, /role="progressbar"/);
assert.match(page, /Sales Stage ACR[\s\S]*USD K/);
assert.match(page, /Solution Design/);
assert.match(page, /Solution Proposal/);
assert.match(page, /Solution Deployment/);
assert.match(page, /kpi-quarter-status-label--achieved/);
assert.match(page, /kpi-quarter-status-label--not-achieved/);
assert.match(page, /kpi-quarter-status-label--in-progress/);
assert.match(page, /kpi-quarter-status-label--not-started/);
assert.doesNotMatch(page, />Edit</);
assert.doesNotMatch(page, />Refresh</);

console.log("kpiActivityUiContract tests passed");
