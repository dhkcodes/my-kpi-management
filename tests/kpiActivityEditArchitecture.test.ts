import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  carryKpiGridRowKey,
  computeKpiColumnLayout,
  createKpiActivityEditState,
  getKpiGridRowKey,
  nextKpiSort,
  sortKpiActivityRows,
  transitionKpiActivityEdit
} from "../src/data/kpiActivityGridModel";
import { KPI_FIELD_CONTRACTS, KpiSpreadsheetRow } from "../src/data/kpiSpreadsheet";

const row = (id: string, title: string, reflected = false): KpiSpreadsheetRow => ({
  id,
  manageTimeReflected: reflected,
  fiscalYear: "FY27",
  kpiCode: "A",
  quarter: "Q1",
  month: "",
  accountWorkload: "",
  workloadId: null,
  mappingStatus: "NOT_REQUIRED",
  title,
  srNumber: id,
  stage: "",
  acrK: null,
  targetQuarter: "",
  deliveryDate: ""
});

let state = createKpiActivityEditState();
assert.equal(state.phase, "view");
state = transitionKpiActivityEdit(state, { type: "begin", cell: { rowId: "r1", field: "title" }, value: "Saved" });
assert.equal(state.phase, "editing");
assert.equal(state.generation, 1);
state = transitionKpiActivityEdit(state, { type: "input", value: "Draft", hasOtherDrafts: false });
assert.equal(state.phase, "dirty");
assert.equal(state.value, "Draft");
state = transitionKpiActivityEdit(state, { type: "input", value: "Saved", hasOtherDrafts: false });
assert.equal(state.phase, "editing", "returning to the original value must not remain dirty");
state = transitionKpiActivityEdit(state, { type: "input", value: "Draft", hasOtherDrafts: false });
state = transitionKpiActivityEdit(state, { type: "finish", hasDrafts: true });
assert.equal(state.phase, "dirty");
assert.equal(state.cell, null);
state = transitionKpiActivityEdit(state, { type: "save" });
assert.equal(state.phase, "saving");
const blocked = transitionKpiActivityEdit(state, { type: "begin", cell: { rowId: "r2", field: "srNumber" }, value: "2" });
assert.deepEqual(blocked, state, "saving must block another edit session");
state = transitionKpiActivityEdit(state, { type: "save-result", hasFailures: true });
assert.equal(state.phase, "dirty", "failed Save rows must leave the modal and remain retryable");
state = transitionKpiActivityEdit(state, { type: "save" });
state = transitionKpiActivityEdit(state, { type: "save-result", hasFailures: false });
assert.equal(state.phase, "view", "successful Save reconciliation must return to view");
state = transitionKpiActivityEdit(state, { type: "reset" });
state = transitionKpiActivityEdit(state, { type: "cancel" });
assert.equal(state.phase, "cancelling");
state = transitionKpiActivityEdit(state, { type: "reset" });
assert.equal(state.phase, "view");

const source = [row("2", "Beta", true), row("draft-a-1", "Zulu"), row("1", "Alpha")];
const ascending = sortKpiActivityRows(source, { field: "title", direction: "asc" });
assert.deepEqual(ascending.map((item) => item.id), ["draft-a-1", "1", "2"], "new draft rows stay first while saved rows sort stably");
assert.deepEqual(source.map((item) => item.id), ["2", "draft-a-1", "1"], "sorting must not mutate the source collection");
assert.deepEqual(nextKpiSort(null, "title"), { field: "title", direction: "asc" });
assert.deepEqual(nextKpiSort({ field: "title", direction: "asc" }, "title"), { field: "title", direction: "desc" });

const gridKeys = new Map<string, string>();
carryKpiGridRowKey(gridKeys, "draft-a-1", "142");
assert.equal(getKpiGridRowKey(gridKeys, "142"), "draft-a-1");

for (const [code, fields] of Object.entries(KPI_FIELD_CONTRACTS)) {
  const narrow = computeKpiColumnLayout(fields, 860);
  const desktop = computeKpiColumnLayout(fields, 1280);
  const wide = computeKpiColumnLayout(fields, 1680);
  assert.equal(narrow.selectorWidth, 52, `${code} selector width`);
  assert.equal(Object.keys(narrow.widths).length, fields.length, `${code} every data field has a width`);
  assert.ok(wide.totalWidth >= desktop.totalWidth, `${code} layout grows with available width`);
  assert.ok(desktop.totalWidth <= 1280, `${code} fits an ordinary desktop host without an internal scrollbar`);
  for (const field of fields) assert.ok((narrow.widths[field.key] ?? 0) >= 96, `${code}.${field.key} remains usable`);
}

const d1Layout = computeKpiColumnLayout(KPI_FIELD_CONTRACTS.D1, 860);
assert.ok((d1Layout.widths.accountWorkload ?? 0) >= 180, "Account / Workload / Oppty.No remains usable on narrow viewports");
assert.ok((d1Layout.widths.manageTimeReflected ?? 0) >= 140, "Manage Time fits its one-line header, sort icon, and Reflected value");
assert.ok((d1Layout.widths.srNumber ?? 0) >= 144, "SR Number fits operating 12-character SR values");
assert.ok((d1Layout.widths.title ?? 0) >= 164, "D1 Activity fits Solution Deployment without ellipsis");
assert.ok((d1Layout.widths.stage ?? 0) >= 132, "Sales Stage fits its one-line header and Identified value");
assert.ok((d1Layout.widths.acrK ?? 0) >= 104, "ACR (K) reserves title and sort-indicator space");
assert.ok((d1Layout.widths.targetQuarter ?? 0) >= 156, "Target Quarter keeps its title and sort icon visibly separated");
assert.ok((d1Layout.widths.deliveryDate ?? 0) >= 140, "Delivery Date fits ISO dates without ellipsis");
assert.ok(d1Layout.totalWidth > 860, "narrow viewports retain fixed widths and scroll inside the Grid");

const page = fs.readFileSync(path.resolve("src/components/content/KpiSpreadsheetPage.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("src/styles/app.css"), "utf8");

assert.doesNotMatch(page, /oj-data-grid|RowDataGridProvider|MutableArrayDataProvider|ojDataGrid|dataGridProvider|providerMutationGenerationRef|providerSettlementRef|loadSkeletons|fillViewport/,
  "KPI Activities must not retain Oracle JET Data Grid providers or viewport lifecycle code");
assert.match(page, /<table[^>]*class="kpi-activities-table"[\s\S]*<thead>[\s\S]*<tbody>/,
  "KPI Activities must render a Preact-owned native table");
assert.match(page, /<tr key=\{`\$\{tableScopeKey\}:\$\{row\.id\}`\}[\s\S]*data-kpi-row-id=\{row\.id\}/,
  "each KPI activity row must be keyed by KPI\/FY scope plus canonical row identity");
assert.doesNotMatch(page, /onojBeforeEdit|onojBeforeEditEnd|_ojBridge|resizeColWidth|editEndingRef|pendingProgrammaticEditRef/,
  "retired cached-editor and private resize lifecycle must be removed");
assert.match(page, /data-kpi-single-editor/, "one page-owned editor overlay must be the only editable DOM surface");
assert.match(page, /KpiActivityEditState|transitionKpiActivityEdit/, "the explicit edit state contract must drive the page");
assert.match(page, /tabIndex=\{0\}[\s\S]*\["Enter", " ", "Space", "Spacebar", "F2"\][\s\S]*onKeyUp[\s\S]*beginEditing\(row, field, event\.currentTarget\)/,
  "native editable cells must support keyboard entry with Enter and Space");
assert.match(page, /id={`kpi-workload-launcher-\$\{state\.generation\}`}/,
  "each workload edit generation must own one concrete launcher");
assert.match(page, /aria-controls=\{`kpi-workload-options-[\s\S]*aria-expanded=\{workloadActive\}[\s\S]*aria-activedescendant=/,
  "the workload combobox must expose its popup and active option state");
assert.match(page, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"[\s\S]*setActiveWorkloadIndex/,
  "the workload popup must support keyboard option traversal");
assert.equal(KPI_FIELD_CONTRACTS.B.find((field) => field.key === "title")?.type, "textarea",
  "SR Description must use the shared multiline textarea keyboard contract");
assert.deepEqual(KPI_FIELD_CONTRACTS.H.find((field) => field.key === "title"), { key: "title", label: "Content", type: "textarea" },
  "H Content must use the shared multiline textarea keyboard contract");
assert.match(page, /const blockContractKey[\s\S]*field\.type === "workload"[\s\S]*ArrowDown[\s\S]*ArrowUp/,
  "Arrow keys must be blocked only for the workload combobox so native select controls retain keyboard navigation");
assert.match(page, /const blockContractKey[\s\S]*event\.target instanceof HTMLTextAreaElement[\s\S]*event\.key === "Enter"[\s\S]*event\.shiftKey[\s\S]*return/,
  "Shift+Enter must bypass keydown blocking so multiline textarea editors retain the native newline action");
assert.match(page, /const keyContract[\s\S]*event\.key === "Enter"[\s\S]*HTMLTextAreaElement[\s\S]*event\.shiftKey[\s\S]*closePopup\(\); onFinish\(\)/,
  "plain Enter must finish textarea editing while Shift+Enter remains inside the editor");
assert.match(page, /state\.generation[\s\S]*setActiveWorkloadIndex\(0\)/,
  "each edit generation must reset the workload active option");
assert.match(page, /setActiveWorkloadIndex\(\(current\) => Math\.min\(current, page\.items\.length\)\)/,
  "replacement workload results must clamp the active option to the available boundary");
assert.match(page, /role="combobox"[\s\S]*aria-controls=\{`kpi-workload-options-/,
  "the workload search input must expose explicit combobox semantics");
assert.match(page, /role="option" aria-selected=\{activeWorkloadIndex === 0\}[\s\S]*aria-selected=\{activeWorkloadIndex === index \+ 1\}/,
  "workload options must expose the active option through aria-selected");
assert.match(page, /window\.addEventListener\("keyup", finishKeyboardAfterFocusMove\)[\s\S]*onMove\(event\.shiftKey \? -1 : 1\)/,
  "Escape and Tab must complete even when popup or native focus movement changes the keyup target");
assert.match(page, /window\.addEventListener\("keydown", retainEditorFocusUntilKeyUp, true\)/,
  "Tab and Escape default focus movement must be blocked at capture time");
assert.match(page, /getBoundingClientRect\(\)[\s\S]*width <= 0[\s\S]*popup\.open/,
  "workload results may open only after the real launcher has non-zero geometry");
assert.match(page, /oj-progress-circle[\s\S]*Saving KPI activities/, "Save must expose a modal progress dialog");
assert.match(page, /savingDialogDesiredRef[\s\S]*savingDialogGenerationRef[\s\S]*settleSavingDialogClosed/,
  "saving dialog continuations must be generation-guarded and explicitly settled closed");
assert.match(page, /settleSavingDialogClosed[\s\S]*whenReady\(\)[\s\S]*dialog\.close\(\)[\s\S]*whenReady\(\)[\s\S]*!dialog\.isOpen\(\)/,
  "terminal Save state must wait for the public close and BusyContext contract");
assert.match(page, /Save changes[\s\S]*Discard changes[\s\S]*Keep editing/,
  "Cancel confirmation must provide save, discard, and keep-editing choices");
assert.match(page, /class="kpi-grid-column-header"[^>]*aria-sort=\{ariaSort\}[\s\S]*class="kpi-grid-sort-button"/,
  "native table headers must expose clickable sorting and aria-sort");
assert.match(page, /const tableScopeKey = `\$\{fiscalYear\}:\$\{activeTab\}`/,
  "KPI and fiscal-year changes must create one explicit native-table state scope");
assert.match(page, /row\.fiscalYear === fiscalYear/,
  "rows from the previous fiscal-year must not enter the active native table");
assert.match(page, /draft\.fiscalYear === fiscalYear[\s\S]*draft\.kpiCode === activeTab/,
  "draft overlays must be scoped to the active KPI/FY table state");
assert.doesNotMatch(page, /key=\{(?:gridSchemaKey|tableScopeKey)\}/,
  "the native table DOM identity must not be remounted on KPI/FY changes");
assert.match(page, /requestProtectedNavigation[\s\S]*finishEditing\(\)[\s\S]*if \(drafts\.length === 0\)/,
  "navigation must finish the single editor and preserve dirty-data protection without a JET settlement queue");
assert.match(page, /target\.closest\("\.oj-datepicker-popup"\)/,
  "the reparented public JET datepicker popup must remain inside the active edit interaction boundary");
assert.match(page, /onvalueChanged=\{\(event: CustomEvent\) => \{[\s\S]*onInput\(field\.key,[\s\S]*onFinish\(\)/,
  "Delivery Date valueChanged must apply the latest value before closing the one-cell editor");
assert.match(page, /quarterSummaryExpanded[\s\S]*salesSummaryExpanded/,
  "quarter-count and Sales Stage ACR summaries must retain independent page-local visibility state");
assert.match(page, /aria-controls=\{summaryId\}[\s\S]*aria-expanded=\{summaryExpanded\}/,
  "the summary visibility control must expose its controlled region and expansion state");
assert.match(page, /Math\.max\(0, host\.clientWidth - 1\)/,
  "native table layout must reserve one pixel for collapsed-border rounding without showing a desktop scrollbar");
assert.match(page, /<Summary[^>]*expanded=\{summaryExpanded\}/,
  "the active summary must receive the retained visibility state");
assert.match(styles, /\.kpi-activities-table-wrap\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/,
  "native table scrolling must remain contained without page-level horizontal overflow");
assert.match(styles, /\.kpi-content:has\(\.kpi-spreadsheet-page\)\s*\{[^}]*align-content:\s*start/,
  "KPI Activities must stay directly below the fiscal-year panel instead of stretching grid rows across the viewport");
assert.match(styles, /\.kpi-sheet-summary\[hidden\]\s*\{[^}]*display:\s*none/,
  "a hidden summary must contribute no height, margin, or padding");
assert.match(styles, /\.kpi-activities-table\s*\{[^}]*border-collapse:\s*collapse[^}]*table-layout:\s*fixed/,
  "native KPI activity table must own deterministic column geometry");
assert.match(styles, /\.kpi-grid-header-title\s*\{[^}]*white-space:\s*nowrap/,
  "header titles must remain on one line");
assert.match(styles, /\.kpi-grid-cell--fixed\s*>\s*span\s*\{[^}]*text-overflow:\s*clip[^}]*white-space:\s*nowrap/,
  "fixed-width cells must show their complete values without ellipsis");
assert.match(styles, /\.kpi-grid-column-header\s*\{[^}]*background:\s*#f4f1ee[^}]*border-right:/,
  "public header templates must provide the Accounts & Workloads-aligned surface and boundary");
assert.match(styles, /\.kpi-grid-cell\.is-unsaved-cell::after[\s\S]*background:\s*#d9438f[\s\S]*bottom:\s*0[\s\S]*height:\s*3px/,
  "dirty cells must use the Accounts & Workloads-style bottom draft line");
assert.match(styles, /\.kpi-grid-sort-button[\s\S]*color:\s*#8b3a2f/,
  "public header-template controls must own the Redwood title color");
assert.match(styles, /\.kpi-cell-editor-overlay--textarea[\s\S]*min-height:\s*8rem[\s\S]*padding:\s*\.75rem[\s\S]*overflow:\s*auto/,
  "textarea overlay must provide visible multiline value, padding, and internal scroll");

console.log("kpiActivityEditArchitecture tests passed");
