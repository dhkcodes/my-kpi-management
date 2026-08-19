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
assert.match(page, /const commitOnEnter = \(event: KeyboardEvent\)[\s\S]{0,320}event\.key === "Enter"[\s\S]{0,300}onChange\(\(event\.currentTarget as HTMLInputElement \| HTMLTextAreaElement\)\.value\)/,
  "text and textarea Enter must synchronously publish the live DOM value before JET ends editing");
assert.doesNotMatch(page, /event\.key !== "Enter"[\s\S]{0,220}event\.stopPropagation\(\)/,
  "Enter must bubble to oj-data-grid so the native cellEdit lifecycle exits the current editor");
assert.match(page, /const closeWorkloadPopup = \(\) => \{[\s\S]{0,180}dispatchEvent\(new Event\("kpi-close-workload-popups"\)\)[\s\S]{0,320}querySelectorAll<ojPopup>[\s\S]{0,320}popup\.isOpen\(\)[\s\S]{0,120}popup\.close\(\)/,
  "edit completion must synchronously close every cached workload popup and notify each owning editor");
assert.match(page, /const closeCachedEditor = \(\) => \{[\s\S]{0,180}closeSession = \+\+popupSessionRef\.current[\s\S]{0,260}cancelAnimationFrame\(focusFrameRef\.current\)[\s\S]{0,260}getBusyContext\(\)\.whenReady\(\)\.then[\s\S]{0,300}popupSessionRef\.current === closeSession[\s\S]{0,220}!activatedRef\.current[\s\S]{0,350}addEventListener\("kpi-close-workload-popups", closeCachedEditor\)/,
  "cached editors must cancel stale focus and guard asynchronous Popup close retries with the owning session");
assert.match(page, /useEffect\(\(\) => \{[\s\S]{0,160}popupSessionRef\.current \+= 1[\s\S]{0,180}activatedRef\.current = autoActivate[\s\S]{0,180}setActivated\(autoActivate\)[\s\S]{0,160}\}, \[activationToken, autoActivate\]\)/,
  "a reused cached workload editor must reactivate from each new edit-session token");
assert.match(page, /const flushActiveEditorDraft[\s\S]{0,2200}querySelector[\s\S]{0,1000}commitDraftRow/,
  "ojBeforeEditEnd must read the active DOM editor and commit its latest value before the Cell closes");
assert.match(page, /const handleBeforeEditEnd[\s\S]{0,180}editEndingRef\.current = true[\s\S]{0,180}closeWorkloadPopup\(\)[\s\S]{0,380}flushActiveEditorDraft\(\)[\s\S]{0,520}editSnapshotRef\.current = null/,
  "normal edit completion must block workload popup reactivation, close cached popups, and flush the latest Cell value before cleanup");
assert.match(page, /workloadAutoActivate=\{field\.type === "workload" && editing && !editEndingRef\.current\}/,
  "workload renderers remounted by draft reconciliation must not auto-open once Cell edit is ending");
assert.match(page, /editEndingRef\.current = false;\s*grid\.setProperty\("editCell", \{ indexes \}\)/,
  "double-click entry must re-enable workload popup activation before Oracle JET renders the edit template");
assert.match(page, /pendingProgrammaticEditRef\.current = null;\s*editEndingRef\.current = false;\s*grid\.setProperty\("editCell"/,
  "new-row programmatic entry must re-enable workload popup activation before Oracle JET renders the edit template");
assert.match(page, /field\.type === "manageTime"[\s\S]{0,650}onChange\(field\.key[\s\S]{0,220}onSelectionComplete\(\)/,
  "Manage Time selection must update draft before ending native edit mode");
assert.match(page, /field\.type === "date"[\s\S]{0,650}onChange\(field\.key[\s\S]{0,220}onSelectionComplete\(\)/,
  "Delivery Date selection must update draft before ending native edit mode");
assert.match(page, /if \(options\)[\s\S]{0,700}onChange\(field\.key[\s\S]{0,220}onSelectionComplete\(\)/,
  "quarter, month, stage, and activity selection must update draft before ending native edit mode");
assert.match(page, /const selectWorkload[\s\S]{0,1000}activeEditorDraftRef\.current = updated[\s\S]{0,500}commitDraftRow\(updated\)/,
  "workload result selection must synchronously retain the selected row for Enter and before-edit-end");
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
assert.match(page, /workloadActivationToken=\{editing \? editGenerationRef\.current : -1\}/,
  "each cached editor instance must receive a distinct edit-session token");
assert.match(page, /onClick=\{\(\) => \{ popupSessionRef\.current \+= 1; activatedRef\.current = true; setActivated\(true\)/, "new-row workload search must also activate when its input is selected");
assert.match(page, /focusFrameRef\.current = window\.requestAnimationFrame[\s\S]{0,220}popupSessionRef\.current === focusSession[\s\S]{0,180}inputRef\.current\?\.isConnected/,
  "choose/reset focus callbacks must not refocus a stale cached editor session");
assert.match(page, /import MutableArrayDataProvider = require\("ojs\/ojmutablearraydataprovider"\)/,
  "KPI tables must keep one mutable DataProvider instead of replacing the whole table for each draft change");
assert.match(page, /useMemo\(\(\) => new MutableArrayDataProvider<string, KpiSpreadsheetRow>\(\[\], \{ keyAttributes: "id" \}\), \[activeTab\]\)/,
  "the mutable KPI DataProvider must remain stable within a tab but retire its model listeners when the tab changes");
assert.match(page, /dataProvider\.data = visibleRows/,
  "visible KPI row updates must be delivered through the stable DataProvider");
assert.match(page, /new RowDataGridProvider[\s\S]*dataProvider/,
  "the stable row DataProvider must be adapted once for the Data Grid");
assert.doesNotMatch(page, /gridRef\.current\?*\.refresh\(\)/,
  "cell edit entry must never refresh the Data Grid or any row");
assert.match(page, /event\.key === "Tab"[\s\S]{0,180}event\.preventDefault\(\)[\s\S]{0,180}onMove\(event\.shiftKey \? -1 : 1\)/,
  "Tab and Shift+Tab must invoke directional Data Grid cell navigation without activating a header cell");
assert.match(page, /const moveCell[\s\S]{0,1500}setProperty\("editCell", \{ indexes: \{ row: next\.row, column: next\.column \} \}\)/,
  "Tab navigation must move to the adjacent editable cell through native editCell without remounting the Grid");
assert.match(page, /event\.detail\.cancelEdit[\s\S]{0,180}reconcileDraft\(current, snapshot\)/,
  "Escape cancellation must restore the cell-entry snapshot and reconcile dirty state");
assert.match(page, /setProperty\("currentCell", \{ type: "cell", indexes: \{ row: context\.item\.rowIndex, column: context\.item\.columnIndex \} \}\)/,
  "pointer edit entry must establish the native current cell before Oracle JET handles Escape");
assert.match(page, /setProperty\("currentCell", \{ type: "cell", indexes: \{ row, column \} \}\)[\s\S]{0,1800}setProperty\("editCell", \{ indexes: \{ row, column \} \}\)/,
  "programmatic first-cell entry must keep currentCell and editCell aligned");
assert.match(page, /workloadAutoActivate=\{field\.type === "workload" && editing && !editEndingRef\.current\}/,
  "workload entry must activate normally but a renderer remounted during native edit completion must stay closed");
assert.doesNotMatch(page, /suppressWorkloadAutoActivateRef/,
  "workload popup activation must not depend on a global suppression flag that can survive a vetoed transition");
assert.match(page, /event\.detail\.cancelEdit[\s\S]{0,500}editEndFrameRef\.current = window\.requestAnimationFrame[\s\S]{0,220}editGenerationRef\.current === generation\) finishCellEdit\(\)/,
  "native Escape completion must settle after Oracle JET's cancel stack only when the edit generation is still current");
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
assert.match(page, /const finishCellEdit[\s\S]{0,800}pendingProgrammaticEditRef\.current = null/,
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
const settleNavigationBlock = page.match(/settleNavigationRef\.current = \(action\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
assert.match(settleNavigationBlock, /finishCellEdit\(\)[\s\S]*setSelectedIds\(new Set\(\)\)[\s\S]*getBusyContext\(\)\.whenReady\(\)/,
  "every KPI route action must finish editing, retire selection, and await the mounted Data Grid BusyContext");
assert.match(settleNavigationBlock, /if \(navigationGenerationRef\.current !== generation\) return;[\s\S]*if \(gridRef\.current !== grid \|\| !grid\.isConnected\)/,
  "navigation must reject a stale, replaced, or disconnected Grid after BusyContext settlement");
assert.match(settleNavigationBlock, /navigationSettlingRef\.current = true[\s\S]*finishCellEdit\(\)/,
  "navigation must suppress newly arriving JET edit events before retiring the active edit");
assert.match(settleNavigationBlock, /if \(navigationGenerationRef\.current !== generation\) return;\s*action\(\)/,
  "overlapping route changes must invalidate stale continuations before the route action executes");
assert.match(settleNavigationBlock, /const sessionKey = sessionKeyRef\.current[\s\S]*action\(\)[\s\S]*requestAnimationFrame[\s\S]*sessionKeyRef\.current === sessionKey[\s\S]*navigationSettlingRef\.current = false/,
  "a settled action that keeps the same route/FY must release edit suppression instead of locking the Grid");
assert.match(page, /const selectQuarter[\s\S]{0,700}requestProtectedNavigation\(quarter \?\? "Fiscal Year", action\)/,
  "clean and dirty quarter row-set changes must both pass through Data Grid BusyContext settlement");
assert.match(page, /const settledAction = \(\) => settleNavigationRef\.current\(action\)/,
  "sidebar, history, fiscal-year, overview, and tab routes must share the same lifecycle settlement gate");
assert.match(page, /onNavigationGuardChange\(requestProtectedNavigation, drafts\.length > 0\)/,
  "the lifecycle settlement gate must remain registered on clean and dirty routes while separately reporting unsaved state");
assert.match(app, /if \(!kpiUnsavedChangesRef\.current\) return;[\s\S]{0,120}event\.preventDefault\(\)/,
  "browser unload protection must depend on unsaved KPI data rather than lifecycle guard presence");
assert.doesNotMatch(page, /onNavigationGuardChange\(drafts\.length > 0/,
  "clean-route navigation must not bypass Data Grid lifecycle settlement");
assert.match(page, /const handleBeforeEdit[\s\S]{0,500}saving \|\| navigationSettlingRef\.current[\s\S]{0,120}event\.preventDefault\(\)/,
  "JET beforeEdit events arriving during route settlement must be vetoed before they can recreate activeCell state");
assert.match(page, /const isCurrentEditRequest[\s\S]{0,500}navigationGenerationRef\.current === navigationGeneration[\s\S]{0,1200}await busyContext\.whenReady\(\);[\s\S]{0,420}if \(!isCurrentEditRequest\(\)\) return/,
  "double-click edit continuations must be invalidated when navigation starts while BusyContext is pending");
assert.match(page, /tabEditFrameRef\.current = window\.requestAnimationFrame[\s\S]{0,500}navigationGenerationRef\.current !== navigationGeneration[\s\S]{0,300}!grid\.isConnected/,
  "Tab-key edit callbacks must reject stale navigation generations and disconnected Grids");
assert.match(page, /const finishCellEdit[\s\S]{0,300}editGenerationRef\.current \+= 1[\s\S]{0,300}cancelAnimationFrame\(tabEditFrameRef\.current\)/,
  "navigation cleanup must invalidate and cancel queued edit callbacks before provider replacement");
assert.doesNotMatch(page, /rowRenderer=/,
  "KPI activities must no longer use the row-level renderer lifecycle");
const workloadChooseStart = page.indexOf("const choose = (option: KpiWorkloadOption)");
const workloadResetEnd = page.indexOf("const loadMore =", workloadChooseStart);
const workloadSelectionHandlers = page.slice(workloadChooseStart, workloadResetEnd);
assert.ok(workloadChooseStart >= 0 && workloadResetEnd > workloadChooseStart);
assert.match(workloadSelectionHandlers, /onChange\(option\);[\s\S]{0,100}onCommit\(\);/,
  "choosing a workload result must synchronously update the draft and end native edit mode without an extra Enter");
assert.match(workloadSelectionHandlers, /onReset\(\);[\s\S]{0,100}onCommit\(\);/,
  "resetting workload selection must synchronously reconcile the draft and end native edit mode");
assert.match(workloadSelectionHandlers, /activatedRef\.current = false/,
  "choosing or resetting a workload must cancel pending popup-open retries before closing the list");
assert.match(page, /if \(event\.key === "Enter"\) \{ activatedRef\.current = false; setActivated\(false\); closePopup\(\); \}/,
  "Enter without choosing a workload must close the popup without replacing the current value");
assert.doesNotMatch(page, /if \(event\.key === "Enter"\) \{[^}]*?(?:preventDefault\(\)|stopPropagation\(\)|onCommit\(\))/,
  "Enter must propagate to the native oj-data-grid cellEdit lifecycle after the draft value is buffered");
assert.doesNotMatch(page, /event\.key === "Enter" && options\[0\]/, "Enter must never auto-select the first workload result");
assert.match(page, />선택 안함</, "workload results must offer restoration of the original value");
assert.match(page, /collision:\s*"flipfit"/, "workload popup must fit or flip at the viewport edge");
assert.match(page, /return \(\) => \{[\s\S]{0,180}popupSessionRef\.current \+= 1[\s\S]{0,180}cancelAnimationFrame\(focusFrameRef\.current\)[\s\S]{0,220}popup\?\.classList\.contains\("oj-complete"\)[\s\S]{0,120}popup\.close\(\)/,
  "an unmounted workload editor must invalidate callbacks and safely close its upgraded Oracle JET popup layer");
assert.match(page, /Save and Continue/);
assert.match(page, /Discard and Continue/);
assert.match(page, />Stay</);
assert.match(page, /Delete selected KPI activities/);
assert.match(page, /selectedQuarter/);
assert.doesNotMatch(page, />Refresh</, "the redundant KPI Refresh button must be removed");
assert.match(page, /setSelectedQuarter\(\(current\) => current === quarter \? null : quarter\)/, "clicking the selected Quarter again must clear the filter");
assert.match(page, /const selectQuarter[\s\S]*setSelectedIds\(new Set\(\)\)/, "every quarter transition must clear row selection");
assert.match(page, /const selectQuarter[\s\S]{0,500}requestProtectedNavigation/,
  "quarter transitions must use the shared lifecycle guard, which prompts only when drafts exist");
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
assert.match(page, /onNavigationGuardChange\(requestProtectedNavigation, drafts\.length > 0\)/, "the KPI page must keep its lifecycle guard registered while reporting dirty state separately");
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
assert.match(page, /const columnWidth = Math\.max\(64, \(Math\.max\(0, width\) - 56\) \/ fields\.length\)/,
  "data columns must derive responsive widths from the observed live Grid host width");
assert.match(page, /const toolbarActions = getKpiToolbarActions\(drafts\.length, selectedRows\.length\)/,
  "Save and Cancel visibility must depend on real drafts, never on simple editor activation");
assert.match(contract, /field\("title", "SR Description", "textarea"\)/,
  "A, B, C1, C2, and F SR Description must be declared as textarea editors");
assert.match(contract, /H:\s*\[manageTime, field\("title", "Content", "textarea"\)/,
  "H Content must be declared as a textarea editor");
assert.match(page, /<BufferedFieldEditor key=\{`\$\{row\.id\}:\$\{field\.key\}:\$\{workloadActivationToken\}`\}/,
  "cached Data Grid templates must key buffered editors by row, field, and edit session so new-row text stays visible");
assert.match(styles, /\.kpi-cell-editor--textarea\s*\{[^}]*box-sizing:\s*border-box[^}]*min-height:\s*(?:7|8|9|\d{2,})rem[^}]*min-width:\s*min\([^}]*padding:\s*\.75rem[^}]*resize:\s*vertical/,
  "textarea editors must expose a comfortable Redwood-sized editing surface with internal padding");
assert.match(page, /kpi-textarea-grid-cell/,
  "textarea columns must receive a public Data Grid cell class for edit-height expansion");
assert.match(styles, /\.kpi-textarea-grid-cell:has\([^}]*kpi-cell-editor--textarea[^}]*\)\s*\{[^}]*height:\s*(?:8|9)(?:\.5)?rem/,
  "the public textarea cell class must expand the JET cell instead of clipping the editor to one row");
assert.match(page, /new ResizeObserver\([\s\S]{0,500}applyAvailableWidth\(entry\.contentRect\.width\)[\s\S]{0,260}observer\.observe\(host\)/,
  "Grid column sizing must react to content-box width changes through ResizeObserver");
assert.match(page, /_WIDGET_INSTANCE\?\.grid[\s\S]{0,500}resizeApi\.m_resizingElement = header[\s\S]{0,160}resizeApi\.resizeColWidth\(oldWidth, columnWidth\)/,
  "responsive sizing must use JET Data Grid's column-resize lifecycle so headers, Cells, and offsets move together");
assert.doesNotMatch(page, /gridRef\.current\?*\.refresh\(\)|grid\.refresh\(\)/,
  "responsive sizing must not use full Data Grid refresh as a resize workaround");
assert.match(page, /flushActiveEditorDraft\(\);[\s\S]{0,260}setProperty\("editCell", null\)[\s\S]{0,260}busyContext\.whenReady\(\)[\s\S]{0,380}setActiveCellNow\(null\)[\s\S]{0,700}setProperty\("editCell", \{ indexes \}\)/,
  "cross-cell double-click must flush and fully retire the previous editor before opening only the requested Cell");
assert.match(page, /class="kpi-grid-header-title"/,
  "every non-selector KPI header must expose a dedicated Redwood title class");
assert.match(styles, /\.kpi-grid-header-title\s*\{[^}]*color:\s*#(?:8b3a2f|7f3b32|6f4b3e)/,
  "KPI header titles must use a readable Redwood-family color");

assert.match(page, /const requestProtectedNavigation[\s\S]{0,320}flushActiveEditorDraftRef\.current\(\)[\s\S]{0,420}drafts\.length === 0 && !hasLiveChange/,
  "protected navigation must flush and compare the live editor value before allowing a clean navigation");

assert.match(page, /const cancelDrafts = \(\) => \{[\s\S]{0,180}activeEditorDraftRef\.current = null[\s\S]{0,180}setActiveCellNow\(null\)[\s\S]{0,120}finishCellEdit\(\)[\s\S]{0,220}setDrafts\(\[\]\)[\s\S]{0,500}dataProvider\.data = getRowsForQuarter\(authoritativeRows, selectedQuarter\)/,
  "Cancel must detach the live editor, clear drafts, and restamp authoritative rows after Grid BusyContext settlement");

console.log("kpiActivityUiContract tests passed");
