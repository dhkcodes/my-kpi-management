import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.resolve("src/components/content/KpiSpreadsheetPage.tsx"), "utf8");
const api = fs.readFileSync(path.resolve("src/data/kpiSpreadsheetApi.ts"), "utf8");
const contract = fs.readFileSync(path.resolve("src/data/kpiSpreadsheet.ts"), "utf8");
const main = fs.readFileSync(path.resolve("src/main.js"), "utf8");
const content = fs.readFileSync(path.resolve("src/components/content/index.tsx"), "utf8");
const app = fs.readFileSync(path.resolve("src/components/app.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("src/styles/app.css"), "utf8");

assert.match(main, /waitSeconds:\s*(?:[3-9]\d|\d{3,})/, "KPI's expanded JET dependency graph must tolerate Tailnet load latency");
assert.match(page, /import "ojs\/ojdatagrid"/, "KPI activities must use Oracle JET Data Grid");
assert.match(page, /import \{ RowDataGridProvider \} from "ojs\/ojrowdatagridprovider"/,
  "KPI activities must adapt the stable row DataProvider through Oracle JET RowDataGridProvider");
assert.match(page, /import "ojs\/ojdatetimepicker"/, "date cells must load Oracle JET Date Picker");
assert.match(page, /<oj-data-grid/, "detail tables must render an oj-data-grid");
assert.match(page, /editMode="cellEdit"/, "KPI activities must use the official cellEdit lifecycle");
assert.match(page, /onDblClick=\{\(event\) => \{[\s\S]*setProperty\("editCell", null\)[\s\S]*await busyContext\.whenReady\(\)[\s\S]*setProperty\("currentCell"[\s\S]*await busyContext\.whenReady\(\)[\s\S]*getProperty\("currentCell"\)[\s\S]*setProperty\("editCell"/,
  "double-click must publicly end the previous editor, then settle currentCell through BusyContext before opening exactly the requested editor");
assert.match(page, /slot="cellTemplate"[\s\S]*render=\{renderKpiCell\}/,
  "cell content must be stamped through the official Data Grid cellTemplate");
assert.match(page, /onojBeforeEdit=\{handleBeforeEdit\}/,
  "Data Grid must expose the official before-edit event flow");
assert.match(page, /onojBeforeEditEnd=\{handleBeforeEditEnd\}/,
  "Data Grid must expose the official before-edit-end event flow");
assert.match(page, /const handleBeforeEditEnd[\s\S]*closeWorkloadPopup\(\)[\s\S]*event\.detail\.cancelEdit/,
  "leaving an editor must close its workload popup without vetoing the native edit transition");
assert.doesNotMatch(page, /popup\.isOpen\(\)[\s\S]{0,120}event\.preventDefault\(\)/,
  "an open search popup must not trap the Data Grid in the previous editable cell");
assert.doesNotMatch(page, />Edit</, "Edit button must be removed");
assert.doesNotMatch(page, /data-kpi-grid-field=\{field\.key\}[\s\S]{0,120}onDblClick=\{\(\) => beginCellEdit/,
  "navigation cells must let oj-data-grid own double-click entry without a competing Preact state update");
assert.match(page, /requestAnimationFrame/, "cell editor focus must wait for JET Data Grid stamping");
assert.match(page, /\.focus\(\)/, "the opened cell editor must receive input focus");
assert.match(page, /event\.key === "Enter"/, "Enter must commit the active editor to the draft");
assert.match(page, /const stopGridInteraction = \(event: Event\) => event\.stopPropagation\(\)/, "KPI editors must isolate input events from oj-data-grid navigation");
assert.match(page, /onInput=\{\(event\) => \{ const next = \(event\.currentTarget as HTML(?:TextArea|Input)Element\)\.value; setEditorValue\(next\); onChange\(next\); \}\}/,
  "buffered editors must continuously place the live control value in the draft before Enter reaches oj-data-grid");
assert.doesNotMatch(page, /const commitOnEnter = \(event: KeyboardEvent\)[\s\S]{0,260}event\.key (?:===|!==) "Enter"/,
  "the buffered editor key handler must not rerender the Data Grid during native Enter edit completion");
assert.doesNotMatch(page, /event\.key !== "Enter"[\s\S]{0,220}event\.stopPropagation\(\)/,
  "Enter must bubble to oj-data-grid so the native cellEdit lifecycle exits the current editor");
assert.doesNotMatch(page, /data-kpi-editor-row[\s\S]{0,300}onKeyDown=\{stopGridInteraction\}/,
  "an editor wrapper must not swallow Enter before the active control commits it");
assert.match(page, /onDblClick=\{stopGridInteraction\}/, "double-clicking an active editor must keep focus in that editor");
assert.match(page, /onMouseDown=\{stopGridInteraction\}/, "selector and editor pointer actions must not activate oj-data-grid focus navigation");
assert.match(page, /is-unsaved-cell/, "changed cells must be visually marked");
assert.match(page, /is-unsaved-row/, "changed rows must be visually marked");
assert.match(page, /kpi-manage-time-reflected-row/, "Manage Time Reflected must mark the full row");
assert.match(page, /<oj-input-date/, "Delivery Date must use oj-input-date");
assert.match(page, /<textarea/, "SR Description must use a textarea editor");
assert.match(page, /kpi-quarter-status-label--achieved/, "quarter status must use a green label class");
assert.match(page, /kpi-quarter-status-label--not-achieved/, "quarter status must use a red label class");
assert.match(page, /kpi-quarter-status-label--in-progress/, "quarter status must use a yellow label class");
assert.match(page, /kpi-quarter-status-label--not-started/, "quarter status must use a gray label class");
assert.match(page, /kpi-quarter-count-label/, "quarter Count must use the same status color label");
assert.match(page, /import "ojs\/ojdialog"/, "navigation and delete confirmations must use Oracle JET Dialog");
assert.match(page, /import "ojs\/ojbutton"/, "KPI dialog actions must use Oracle JET buttons");
assert.match(page, /<oj-popup/, "truncated SR Description must expose its full value in an Oracle JET Popup");
assert.match(page, /kpi-workload-results-popup/, "workload search results must render in a popup layer outside oj-data-grid clipping");
assert.match(page, /getBusyContext\(\)\.whenReady\(\)[\s\S]*openPopup/,
  "auto-open must wait for the Oracle JET popup BusyContext rather than an arbitrary timeout");
assert.match(page, /of:\s*`#\$\{launcherId\}`/,
  "every workload popup position must explicitly anchor to its live search input");
assert.doesNotMatch(page, /setTimeout\(openPopup/,
  "workload popup positioning must not be hidden behind arbitrary retry timeouts");
assert.match(page, /autoActivate[\s\S]*useState\(autoActivate\)/, "double-clicked workload editors must activate their result popup immediately");
assert.match(page, /onClick=\{\(\) => \{ activatedRef\.current = true; setActivated\(true\)/, "new-row workload search must also activate when its input is selected");
assert.match(page, /import MutableArrayDataProvider = require\("ojs\/ojmutablearraydataprovider"\)/,
  "KPI tables must keep one mutable DataProvider instead of replacing the whole table for each draft change");
assert.match(page, /useMemo\(\(\) => new MutableArrayDataProvider<string, KpiSpreadsheetRow>\(\[\], \{ keyAttributes: "id" \}\), \[\]\)/,
  "the KPI DataProvider identity must remain stable across all table edits");
assert.match(page, /dataProvider\.data = visibleRows/,
  "visible KPI row updates must be delivered through the stable DataProvider");
assert.match(page, /new RowDataGridProvider[\s\S]*dataProvider/,
  "the stable row DataProvider must be adapted once for the Data Grid");
assert.doesNotMatch(page, /gridRef\.current\?*\.refresh\(\)/,
  "cell edit entry must never refresh the Data Grid or any row");
assert.match(page, /event\.key === "Tab"[\s\S]{0,180}event\.preventDefault\(\)[\s\S]{0,180}onMove\(event\.shiftKey \? -1 : 1\)/,
  "Tab and Shift+Tab must invoke directional Data Grid cell navigation without activating a header cell");
assert.match(page, /const moveCell[\s\S]{0,900}setProperty\("editCell", \{ indexes: \{ row: next\.row, column: next\.column \} \}\)/,
  "Tab navigation must move to the adjacent editable cell through native editCell without remounting the Grid");
assert.match(page, /event\.detail\.cancelEdit[\s\S]{0,180}reconcileDraft\(current, snapshot\)/,
  "Escape cancellation must restore the cell-entry snapshot and reconcile dirty state");
assert.match(page, /setProperty\("currentCell", \{ type: "cell", indexes: \{ row: context\.item\.rowIndex, column: context\.item\.columnIndex \} \}\)/,
  "pointer edit entry must establish the native current cell before Oracle JET handles Escape");
assert.match(page, /setProperty\("currentCell", \{ type: "cell", indexes: \{ row, column \} \}\)[\s\S]{0,1800}setProperty\("editCell", \{ indexes: \{ row, column \} \}\)/,
  "programmatic first-cell entry must keep currentCell and editCell aligned");
assert.match(page, /workloadAutoActivate=\{field\.type === "workload" && editing\}/,
  "workload entry must retain popup activation after the native setProperty transition");
assert.doesNotMatch(page, /suppressWorkloadAutoActivateRef/,
  "workload popup activation must not depend on a global suppression flag that can survive a vetoed transition");
assert.match(page, /event\.detail\.cancelEdit[\s\S]{0,320}window\.requestAnimationFrame\(finishCellEdit\)/,
  "native Escape completion must cleanly settle after Oracle JET finishes its cancel stack");
const addDraftBlock = page.match(/const addDraft = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
assert.doesNotMatch(addDraftBlock, /finishCellEdit\(/,
  "new draft insertion must not remount the Grid while JET property updates are batched");
assert.match(addDraftBlock, /if \(activeCellRef\.current\) return/,
  "new draft insertion must not overlap an existing native edit session");
const pendingEditEffect = page.match(/useEffect\(\(\) => \{\n    const pending = pendingProgrammaticEditRef\.current;([\s\S]*?)\n  \}, \[fields, visibleRows\]\);/)?.[1] ?? "";
assert.match(pendingEditEffect, /waitForKpiGridRow[\s\S]*getBusyContext\(\)\.whenReady\(\)[\s\S]*setProperty\("currentCell"[\s\S]*getBusyContext\(\)\.whenReady\(\)[\s\S]*setProperty\("editCell"/,
  "programmatic first edit must wait for row reflection and JET readiness before each property transition");
assert.match(pendingEditEffect, /currentCell\?\.type !== "cell"[\s\S]*currentCell\.indexes\?\.row[\s\S]*pendingProgrammaticEditRef\.current = null/,
  "nullable or divergent JET currentCell state must retire the pending edit without throwing or replaying later");
assert.match(page, /const finishCellEdit[\s\S]{0,320}pendingProgrammaticEditRef\.current = null/,
  "edit-session cleanup must invalidate any pending programmatic first edit");
assert.doesNotMatch(page, /grid(?:Ref\.current)?\.(?:currentCell|editCell)\s*=\s*(?:null|undefined)/,
  "Data Grid lifecycle properties must never be assigned null or undefined directly");
assert.match(page, /setProperty\("editCell", null\)[\s\S]*busyContext\.whenReady\(\)[\s\S]*setProperty\("currentCell"/,
  "cross-cell transitions must use the official editCell null state and wait for JET completion before opening the next Cell");
assert.doesNotMatch(page, /grid(?:Ref\.current)?\.(?:currentCell|editCell)\s*=/,
  "imperative Data Grid transitions must use setProperty instead of Preact's queued property setter");
assert.match(page, /disabled=\{saving \|\| drafts\.length > 0 \|\| activeCell !== null\}/,
  "Add must be unavailable while a native cell edit is active");
assert.doesNotMatch(page, /setGridMounted\(false\)|setGridVersion/,
  "edit completion must preserve the mounted Data Grid identity");
assert.match(page, /const navigateFromGrid[\s\S]{0,320}finishCellEdit\(\)[\s\S]{0,160}onNavigate\(nextRouteId\)/,
  "clean tab navigation must finish the active cell before replacing the Data Grid");
assert.doesNotMatch(page, /rowRenderer=/,
  "KPI activities must no longer use the row-level renderer lifecycle");
const workloadChooseStart = page.indexOf("const choose = (option: KpiWorkloadOption)");
const workloadResetEnd = page.indexOf("const loadMore =", workloadChooseStart);
const workloadSelectionHandlers = page.slice(workloadChooseStart, workloadResetEnd);
assert.ok(workloadChooseStart >= 0 && workloadResetEnd > workloadChooseStart);
assert.doesNotMatch(workloadSelectionHandlers, /onCommit\(\)/,
  "choosing or resetting a workload must keep the editor active instead of handing focus back to the oj-data-grid header");
assert.match(workloadSelectionHandlers, /activatedRef\.current = false/,
  "choosing or resetting a workload must cancel pending popup-open retries before closing the list");
assert.match(page, /if \(event\.key === "Enter"\) \{ activatedRef\.current = false; setActivated\(false\); closePopup\(\); \}/,
  "Enter without choosing a workload must close the popup without replacing the current value");
assert.doesNotMatch(page, /if \(event\.key === "Enter"\) \{[^}]*?(?:preventDefault\(\)|stopPropagation\(\)|onCommit\(\))/,
  "Enter must propagate to the native oj-data-grid cellEdit lifecycle after the draft value is buffered");
assert.doesNotMatch(page, /event\.key === "Enter" && options\[0\]/, "Enter must never auto-select the first workload result");
assert.match(page, />선택 안함</, "workload results must offer restoration of the original value");
assert.match(page, /collision:\s*"flipfit"/, "workload popup must fit or flip at the viewport edge");
assert.match(page, /return \(\) => \{ if \(popup\?\.classList\.contains\("oj-complete"\) && popup\.isOpen\(\)\) popup\.close\(\); \}/,
  "an unmounted workload editor must safely close its upgraded Oracle JET popup layer");
assert.match(page, /Save and Continue/);
assert.match(page, /Discard and Continue/);
assert.match(page, />Stay</);
assert.match(page, /Delete selected KPI activities/);
assert.match(page, /selectedQuarter/);
assert.doesNotMatch(page, />Refresh</, "the redundant KPI Refresh button must be removed");
assert.match(page, /setSelectedQuarter\(\(current\) => current === quarter \? null : quarter\)/, "clicking the selected Quarter again must clear the filter");
assert.match(page, /const selectQuarter[\s\S]*setSelectedIds\(new Set\(\)\)/, "every quarter transition must clear row selection");
assert.match(page, /const selectQuarter[\s\S]{0,500}drafts\.length > 0[\s\S]{0,180}requestProtectedNavigation/,
  "dirty quarter transitions must use the Stay, Save and Continue, or Discard and Continue dialog");
assert.match(page, /const selectedRows = visibleRows\.filter/, "delete candidates must be scoped to currently visible rows");
assert.match(page, /const closeDescriptionPopup[\s\S]*cancelDescriptionPopupOpen\(\)[\s\S]*descriptionPopupRef\.current\?\.close\(\)/, "mouseleave and blur must cancel a pending popup open");
assert.match(page, /onMouseLeave=\{closeDescriptionPopup\}[\s\S]*onBlur=\{closeDescriptionPopup\}/);
assert.match(page, /drafts\.filter[\s\S]*authoritativeRows/, "new draft rows must be placed before saved rows");
assert.match(contract, /Account \/ Workload \/ Oppty\.No/);
assert.match(page, /Solution Design/);
assert.match(page, /Solution Proposal/);
assert.match(page, /Solution Deployment/);
assert.match(page, /role="progressbar"/, "D1 summary must expose accessible progress bars");
assert.match(page, /Sales Stage ACR[\s\S]*USD K/);

const toolbarStart = page.indexOf('<div class="kpi-activity-toolbar"');
const toolbarEnd = page.indexOf("<Summary rows=", toolbarStart);
const toolbar = page.slice(toolbarStart, toolbarEnd);
assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
assert.match(toolbar, /kpi-activity-toolbar__left/);
assert.match(toolbar, /kpi-activity-toolbar__right/);
assert.ok(toolbar.indexOf(">Save<") < toolbar.indexOf(">Cancel<"));
assert.match(toolbar, /toolbarActions\.includes\("save"\).*Save/s);
assert.match(toolbar, /toolbarActions\.includes\("cancel"\).*Cancel/s);
assert.match(toolbar, /toolbarActions\.includes\("delete"\).*Delete/s);
assert.match(page, /Promise\.allSettled\(draftSnapshot\.map/s, "Save must send every changed row snapshot");
assert.match(page, /Promise\.allSettled\(rowsToDelete\.map/s, "Delete must support multiple selected rows");
assert.match(page, /sessionVersion\.current !== saveSession/, "late Save responses must not update a different FY\/route session");
assert.match(page, /setReloadVersion\(\(current\) => current \+ 1\)/, "discarded mutation responses must trigger a fresh active-route fetch");
assert.doesNotMatch(page, /deferredDraftsRef/, "navigation guard must replace deferred stale toolbar state");
assert.match(page, /requestVersion\.current !== requestVersionAtStart/, "workload pagination must reject stale query responses");
assert.match(page, /const \[editorValue, setEditorValue\] = useState\(value\)/, "text editors must buffer keystrokes locally instead of rebuilding the table per character");
assert.match(page, /onInput=\{\(event\) => \{ const next = \(event\.currentTarget as HTML(?:TextArea|Input)Element\)\.value; setEditorValue\(next\); onChange\(next\); \}\}/,
  "editable text must update its draft as the user types so Enter and Save never read stale buffered state");
assert.doesNotMatch(page, /onBlur=\{commit\}/,
  "Cancel must not be followed by an unmount blur commit that recreates a discarded draft");
assert.doesNotMatch(page, /ensureDraft\(row\)/, "opening an unchanged editor must not create a dirty draft");
assert.match(page, /setDrafts\(\[\]\)/, "Cancel\/save success must clear drafts");
assert.match(api, /workloadId/, "save payload must preserve stable workloadId");
assert.doesNotMatch(page, /<th>Rows<\/th>/);
assert.match(page, /overview\?\.target/);
assert.match(page, /listKpiOverview/);
assert.match(page, /onNavigationGuardChange\(drafts\.length > 0 \? requestProtectedNavigation : null\)/, "the KPI page must register its JET-dialog guard only while drafts exist");
assert.match(content, /onKpiNavigationGuardChange[\s\S]*onNavigationGuardChange=\{onKpiNavigationGuardChange\}/, "Content must forward the KPI guard registration to App");
assert.match(app, /onKpiNavigationGuardChange=\{handleKpiNavigationGuardChange\}/);
assert.match(app, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/, "KPI drafts must participate in browser unload protection");
assert.match(app, /if \(kpiGuard\) kpiGuard\(route\.pageTitle, navigate\)/, "App side navigation must use the registered JET dialog guard");
assert.match(app, /if \(kpiGuard\) kpiGuard\(nextFiscalYear, changeFiscalYear\)/, "App fiscal-year changes must use the registered JET dialog guard");
assert.match(app, /pendingKpiPopstatePromptRef\.current = \{[\s\S]*confirmedKpiPopstateRetryRef\.current = \{ historyIndex: destinationIndex, href: destinationHref \}[\s\S]*window\.history\.go\(-restorationDelta\)[\s\S]*window\.history\.go\(restorationDelta\)/, "rejected popstate must register one confirmed retry and restore the current history entry before prompting");
assert.match(app, /if \(confirmedRetry\) confirmedKpiPopstateRetryRef\.current = null/, "the popstate retry bypass must be consumed exactly once");
assert.match(app, /UNSAVED_WEEKLY_ACTIVITY_MESSAGE[\s\S]*window\.confirm/, "the existing Weekly Activity native guard must remain intact");
assert.doesNotMatch(page, /window\.confirm/, "the KPI guard must keep the centrally mounted Oracle JET dialog");
assert.match(page, /<oj-button[\s\S]*Save and Continue/, "navigation actions must use JET Button components");
assert.match(page, /<oj-button[\s\S]*Delete/, "delete confirmation actions must use JET Button components");
assert.match(page, /selectionMode=\{KPI_GRID_SELECTION_MODE\}/, "ordinary row and cell clicks must not control selection");
assert.match(page, /<Selector/, "only an explicit Oracle JET selector checkbox may change selected rows");
assert.match(page, /type="checkbox" aria-label="Select all KPI activities"/,
  "the Select header must render a select-all checkbox");
assert.match(page, /slot="columnHeaderTemplate"[\s\S]*render=\{renderKpiColumnHeader\}/,
  "the first Data Grid header must be replaced by a select-all template");
assert.doesNotMatch(page, /columnHeaders:\s*\{\s*column:\s*\["Select"/,
  "the Select header text must be removed");
assert.match(page, /function KpiRowSelector[\s\S]*useState<ImmutableKeySet<string>>\(new KeySetImpl[\s\S]*setSelectorKeys\(keySet\)[\s\S]*onSelectionChange\(nextSelected\)/,
  "each selector must own its visible KeySet so a checkbox updates without refreshing the whole table");
assert.match(page, /className:[\s\S]*kpi-reflected-grid-cell/,
  "Reflected state must be applied through the public Data Grid cell className contract to every cell in the row");
assert.match(styles, /\.kpi-reflected-grid-cell\s*\{[^}]*background:\s*#eaf4ec/,
  "the full reflected row, including the selector/title cell, must use one contiguous background");
assert.match(styles, /\.kpi-jet-editable-grid\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/,
  "every KPI Data Grid must contract and expand with its window container");
assert.match(page, /availableWidth = Math\.max\(grid\.clientWidth - 56, columnCount \* 64\)[\s\S]*availableWidth \/ columnCount/,
  "data columns must derive responsive widths from the live Grid width");
assert.match(page, /const toolbarActions = getKpiToolbarActions\(drafts\.length, selectedRows\.length\)/,
  "Save and Cancel visibility must depend on real drafts, never on simple editor activation");

console.log("kpiActivityUiContract tests passed");
