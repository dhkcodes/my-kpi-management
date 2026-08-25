import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const page = read("src/components/content/AccountsWorkloadsPage.tsx");
const content = read("src/components/content/index.tsx");
const pulse = read("src/components/content/AccountsWorkloadsPulseV2.tsx");
const customers360 = read("src/components/content/MyCustomers360Page.tsx");
const app = read("src/components/app.tsx");
const styles = read("src/styles/app.css");
const indexHtml = read("src/index.html");
const header = read("src/components/header.tsx");
const packageJson = read("package.json");
const targetPeriod = read("src/data/targetPeriod.ts");

assert.match(indexHtml, /<title>My KPI &amp; Account Planner<\/title>/, "browser title uses the finalized KAP product name");
assert.match(app, /appName = "My KPI & Account Planner"/, "app header defaults to the finalized KAP product name");
assert.match(header, /aria-label="My KPI & Account Planner"/, "header brand landmark uses the finalized accessible product name");
assert.match(packageJson, /"description": "My KPI & Account Planner — Goals, Accounts and Next Actions"/, "package metadata uses the finalized KAP product name");
assert.doesNotMatch(`${indexHtml}\n${app}\n${header}\n${packageJson}`, /KPI Management|Oracle KPI cockpit|KPI operating cockpit/, "legacy product names are removed from product metadata and the app shell");

assert.match(page, /classifyAccountDeleteTargets/, "draft, saved active, and permanent targets are classified before deletion");
assert.match(page, /dialogTitle="Permanently delete saved row\?"/, "only permanent deletion retains confirmation");
assert.match(page, />Delete<\/oj-button>/, "confirmation uses the requested Delete label");
assert.match(page, />Cancel<\/oj-button>/, "confirmation uses the requested Cancel label");
assert.match(page, /const focusDeleteCancel = \(\) => window\.setTimeout/,
  "the dialog defers initial focus until the JET focus cycle settles");
assert.match(page, /shadowRoot\?\.querySelector<HTMLButtonElement>\("button"\)[\s\S]*target\?\.focus\(\)/,
  "the least destructive dialog action receives native initial focus");
assert.match(page, /onojOpen=\{focusDeleteCancel\}/,
  "the least destructive dialog action receives initial focus");
assert.match(page, /cancelBehavior="escape"/, "Escape closes the modal confirmation");
assert.match(page, /restoreDeleteLauncherFocus/, "dialog close restores focus to the launcher or stable Add Account fallback");
assert.match(page, /const requestDelete = async \(\) => \{[\s\S]*targets\.draftIds\.length > 0[\s\S]*setAddingRow\(null\)[\s\S]*remainingSavedTargets/,
  "Delete removes an unsaved Draft immediately before any saved-row action");
assert.match(page, /if \(remainingSavedTargets === 0\)[\s\S]*return;/,
  "Draft-only delete returns without opening a dialog or calling the API");
assert.match(page, /targets\.activeIds\.length > 0[\s\S]*applyDraftDelete[\s\S]*runImmediateRowsAction/,
  "saved active rows move to Draft Delete immediately without confirmation");
assert.match(page, /if \(targets\.permanentIds\.length === 0\)[\s\S]*return;/,
  "Draft Delete completes without opening the permanent-delete dialog");
assert.match(page, /setDeleteTargets\(\{ \.\.\.targets, draftIds: \[\], activeIds: \[\], baseRows \}\)/,
  "only saved permanent targets reach confirmation");
assert.match(app, /accountsWorkloadsDataSource !== "api"[\s\S]{0,300}applyPermanentDeletesLocally\(rows, permanentDeleteIds\)[\s\S]{0,300}items: localRows[\s\S]{0,200}total: localRows\.length[\s\S]{0,300}\[fiscalYear\]: localRows/,
  "the local/fallback adapter removes confirmed permanent targets from both its authoritative response and parent state");
assert.doesNotMatch(page, /\{deleteMode ===|Selected rows:/, "dynamic top-action delete labels and selected count are absent");
assert.match(page, /hasSelectedDeletedRows[\s\S]*&& \([\s\S]*>Restore<\/oj-button>/, "Restore is conditionally rendered for deleted selections");
assert.match(page, />Refresh<\/oj-button>/, "Refresh action is rendered");
assert.match(page, /accounts-workloads-notes-content[^>]*title=/, "Notes exposes full content through a native tooltip");
assert.match(content, /oj-progress-circle[\s\S]*value=\{-1\}/, "initial load uses an indeterminate JET progress circle");
assert.match(app, /getNavigationRouteFromPath\(window\.location\.pathname\)/, "initial route comes from the browser pathname");
assert.match(app, /window\.history\.pushState[\s\S]*getNavigationPath\(route\)/, "navigation updates the canonical URL");
assert.match(app, /addEventListener\("popstate"/, "Back and Forward update the active route");
assert.doesNotMatch(app, /onFiscalYearChange=\{\(year\) => \{[\s\S]*setSelectedNavigationId\("home"\)/, "FY changes retain navigation selection and route");
assert.match(styles, /@media \(min-width: 1025px\)[\s\S]*?\.kpi-side-nav[\s\S]*?width: 16\.5rem/, "desktop navigation is 16.5rem wide");
assert.match(styles, /\.kpi-navigation-label[^}]*font-size: 0\.84rem/, "desktop navigation labels use the compact font size");
assert.match(app, /class="kpi-navigation-label"[^>]*title=\{item\.label\}[^>]*tabIndex=\{0\}/, "every navigation label exposes its full name natively and accepts keyboard focus");
assert.doesNotMatch(app, /kpi-navigation-full-name/, "JET sliding navigation avoids duplicate hidden label text");
assert.doesNotMatch(styles, /kpi-navigation-full-name/, "obsolete app-owned navigation tooltip CSS is removed");
assert.match(page, /id="accountsWorkloadsSearchInput"[\s\S]*onInput=\{\(event\)[\s\S]*setSearchTerm\(search\)[\s\S]*onKeyDown=\{submitSearchOnEnter\}/, "search typing changes only the local draft and Enter submits");
assert.match(page, /id="accountsWorkloadsSearchButton"[\s\S]*aria-label="Search accounts and workloads"[\s\S]*onClick=\{submitSearch\}/, "accessible search icon button submits the server query");
assert.match(styles, /\.accounts-workloads-search__control\s*\{[^}]*display: flex[^}]*flex-wrap: nowrap/, "search input and button stay on one row at every viewport");
assert.match(styles, /\.accounts-workloads-search__control input\s*\{[^}]*flex: 1 1 auto[^}]*min-width: 0/, "search input can flex without forcing the button to wrap");
assert.match(styles, /\.accounts-workloads-search__control button\s*\{[^}]*flex: 0 0 auto/, "search button remains visible beside the flexible input");
assert.doesNotMatch(page, /onInput=\{\(event\) => \{[\s\S]{0,250}onQueryChange/, "search input does not query the server per keystroke");
assert.match(page, /toggleSort[\s\S]{0,350}onQueryChange\(\{ \.\.\.query, search: query\.search, includeDeleted/, "sorting preserves the last submitted search instead of submitting the draft");
assert.match(page, /nextIncludeDeleted[\s\S]{0,350}onQueryChange\(\{ \.\.\.query, search: query\.search, includeDeleted: nextIncludeDeleted/, "Include deleted preserves the last submitted search instead of submitting the draft");
assert.match(app, /handleAccountsWorkloadsRefresh[\s\S]*setAccountsWorkloadsRefreshing\(true\)[\s\S]*fetchAccountsWorkloads\(\{ fiscalYear, \.\.\.accountsWorkloadsQuery \}\)[\s\S]*setAccountsWorkloadsRows/, "Refresh re-fetches the lower table with the exact committed query");
assert.doesNotMatch(app, /handleAccountsWorkloadsRefresh[\s\S]{0,800}setAccountsWorkloadsLoading\(true\)/, "Refresh does not replace the whole page with initial loading state");
assert.doesNotMatch(app, /accountsWorkloadsRefreshVersion/, "Refresh does not replay the full-page loading effect");
assert.match(app, /handleAccountsWorkloadsQueryChange[\s\S]*setAccountsWorkloadsRefreshing\(true\)[\s\S]*fetchAccountsWorkloads\(\{ fiscalYear, \.\.\.nextQuery \}\)[\s\S]*setAccountsWorkloadsQuery\(nextQuery\)[\s\S]*setAccountsWorkloadsRows/, "Search, Include deleted, and sort changes re-fetch only the table with the next committed query");
assert.doesNotMatch(app, /handleAccountsWorkloadsQueryChange[\s\S]{0,1000}setAccountsWorkloadsLoading\(true\)/, "query changes never replace the whole page with initial loading state");
assert.match(app, /accountsWorkloadsRequestIdRef[\s\S]*handleAccountsWorkloadsQueryChange[\s\S]*requestId = \+\+accountsWorkloadsRequestIdRef\.current[\s\S]*requestId !== accountsWorkloadsRequestIdRef\.current/, "stale query responses cannot overwrite a newer FY, route, refresh, or query request");
assert.match(app, /handlePopState[\s\S]{0,2000}if \(route\.module !== activeRouteModuleRef\.current\)[\s\S]{0,250}accountsWorkloadsRequestIdRef\.current \+= 1[\s\S]*handleNavigate[\s\S]{0,1200}if \(route\.module !== activeRouteModuleRef\.current\)[\s\S]{0,250}accountsWorkloadsRequestIdRef\.current \+= 1/, "route transitions synchronously invalidate pending table requests only when a replacement load will run");
assert.match(app, /handleFiscalYearChange[\s\S]{0,180}if \(nextFiscalYear === fiscalYearRef\.current\) return;[\s\S]{0,180}accountsWorkloadsRequestIdRef\.current \+= 1/, "reselecting the active FY cannot orphan an in-flight load");
assert.match(app, /fetchAccountsWorkloads\(\{ fiscalYear, \.\.\.nextQuery \}\)[\s\S]*requestId !== accountsWorkloadsRequestIdRef\.current[\s\S]*setAccountsWorkloadsQuery\(nextQuery\)/, "the committed query advances only after the matching request succeeds");
assert.match(page, /if \(!accountsWorkloadsRefreshing\)[\s\S]{0,500}setSearchTerm\(query\.search \?\? ""\)[\s\S]{0,500}\}, \[accountsWorkloadsRefreshing, query\.direction, query\.includeDeleted, query\.search, query\.sort\]\)/, "failed query changes restore the committed query controls");
assert.match(app, /onAccountsWorkloadsQueryChange=\{\(nextQuery\) => void handleAccountsWorkloadsQueryChange\(nextQuery\)\}/, "the table routes committed query changes through table-only loading");
assert.doesNotMatch(app, /\[activeRoute\.module, accountsWorkloadsQuery, fiscalYear\]/, "the full-page load effect does not replay for table query changes");
assert.match(page, /accountsWorkloadsRefreshing[\s\S]*role="status"[\s\S]*Refreshing table/, "lower table exposes its own refresh pending state");
assert.match(page, /id="accountsWorkloadsSearchInput"[\s\S]{0,180}disabled=\{draftActive \|\| accountsWorkloadsRefreshing\}/, "search input locks during table refresh");
assert.match(page, /id="accountsWorkloadsSearchButton"[\s\S]{0,220}disabled=\{draftActive \|\| accountsWorkloadsRefreshing\}/, "search submit locks during table refresh");
assert.match(page, /<oj-switch[\s\S]{0,180}disabled=\{draftActive \|\| accountsWorkloadsRefreshing\}/, "Include deleted locks during table refresh");
assert.match(app, /setKpiGuides\(\[\]\)[\s\S]*fetchKpiGuides\(fiscalYear\)/, "KPI Guide reload clears stale FY data before fetching");
assert.match(content, /guideRecords\.length === 0[\s\S]*getGuideDetails\(guide\)[\s\S]*setSavedGuideDetails\(authoritative\)[\s\S]*\}, \[guideRecords, fiscalYear\]\)/, "empty Guide responses reset child details to the current FY fallback");
assert.match(app, /fiscalYearRef[\s\S]*draft\.fiscalYear !== fiscalYearRef\.current[\s\S]*updateKpiGuide\(draft\)[\s\S]*fiscalYearRef\.current !== authoritative\.fiscalYear/, "late Guide saves cannot overwrite a different current FY");
assert.match(app, /setFxRate\(null\)[\s\S]*fetchFxRate\(fiscalYear\)/, "FX reload clears stale FY data before fetching");
assert.match(app, /fetchKpiGuides\(fiscalYear\)/, "opening the KPI Guide loads authoritative FY data");
assert.match(app, /updateKpiGuide\(draft\)/, "KPI Guide Save awaits the API adapter");
assert.match(app, /fetchFxRate\(fiscalYear\)/, "FY changes load the authoritative FX rate");
assert.doesNotMatch(page, /applyExchangeRate[\s\S]{0,500}(?:onSaveFxRate|updateFxRate|await)/, "FX Apply performs no API request");
assert.match(page, /applyExchangeRate[\s\S]*setExchangeRate\(parsed\)[\s\S]*arrKrw:[\s\S]*parsed[\s\S]*setAddingRow[\s\S]*acrKrw:[\s\S]*parsed[\s\S]*setFxPopoverOpen\(false\)/, "FX Apply updates the draft rate and recalculates table and add-row KRW values");
assert.match(page, /current\.map\(\(row\) => row\.isDeleted\s*\?\s*row\s*:/, "FX Apply leaves deleted rows unchanged so they are not emitted as stale active-row patches");
assert.match(page, /onRowsChange\(rowsToSave, \[\], draftFxRate\)/, "main Save sends editable row operations and optional FX without carrying delete state");
assert.match(page, /runImmediateRowsAction[\s\S]*onRowsChange\(nextRows, permanentIds\)/,
  "Highlight, restore, soft delete, and permanent delete persist independently from editable Save/Cancel");
assert.match(page, /const authoritative = await[\s\S]*setDraftRows\(authoritative\.items\)[\s\S]*authoritative\.fxRate/, "Save adopts authoritative rows and latest FX version");
assert.doesNotMatch(page, /Some changes were saved|Some rows were deleted permanently|Completed deletions were reconciled|partial/i, "atomic save errors never imply partial persistence");
assert.match(app, /saveAccountsWorkloadsBatch\(/, "App uses the atomic Accounts & Workloads batch adapter");
assert.doesNotMatch(app, /persistAndReconcileAccountWorkloadChanges\(/, "App no longer sequences row mutations");
assert.match(content, /id="kpiGuideLoading"[\s\S]*guideLoading/, "KPI Guide exposes a browser-checkable pending state");
assert.match(content, /id="kpiGuideError"[\s\S]*role="alert"/, "KPI Guide exposes an error state");
assert.match(content, /class="kpi-guide-dialog__body"/, "KPI Guide uses an app-owned scroll body");
assert.match(styles, /\.kpi-guide-dialog\s*\{[^}]*max-height: min\(92dvh, 58rem\)[^}]*display: flex[^}]*flex-direction: column/, "KPI Guide is constrained to the dynamic viewport");
assert.match(styles, /\.kpi-guide-dialog__body\s*\{[^}]*min-height: 0[^}]*overflow-y: auto/, "KPI Guide body owns vertical scrolling so Notes remain reachable");
assert.match(styles, /\.kpi-guide-layout\s*\{[^}]*min-height: 28rem/, "KPI Guide content is compact enough for one-screen desktop viewing");
assert.match(styles, /\.kpi-guide-criteria-table th\s*\{[^}]*padding: 0\.62rem/, "KPI Guide headings use compact vertical spacing");
assert.match(styles, /\.kpi-guide-criteria-table td\s*\{[^}]*line-height: 1\.35[^}]*padding: 0\.62rem/, "KPI Guide values use compact row height without removing wrapping");
assert.doesNotMatch(styles, /\.oj-dialog|\.oj-dialog-content|\.oj-dialog-body/, "KPI Guide scrolling does not override JET internal DOM");
assert.match(page, /id="accountsWorkloadsFxError"[\s\S]*role="alert"/, "FX exposes an error state");

assert.match(page, /aria-label="Add Account"[^>]*title="Add Account"[^>]*>Add Account<\/oj-button>/, "Accounts-only create action uses Add Account for text, accessibility, and tooltip");
const addDraftRowAt = page.indexOf("key={addingRow.id}");
const savedRowsAt = page.indexOf("visibleRows.map((row, index)");
assert.ok(addDraftRowAt >= 0 && addDraftRowAt < savedRowsAt,
  "the stable-key Add Account draft row is rendered above saved rows");
assert.match(pulse, /Target input completeness/, "Home names Target Coverage as input completeness");
assert.match(content, /readOnly[\s\S]{0,160}value=\{details\.targetPerQuarter\}/,
  "the authoritative KPI target is read-only in Guide edit mode");
assert.match(pulse, /Active Commitments/, "Home distinguishes commitment rows from workloads");
assert.match(pulse, /Commitments by Account/, "Home distribution is named for commitment rows");
assert.match(customers360, /<th class="is-numeric">Commitments<\/th>/,
  "Portfolio labels row counts as commitments");
assert.doesNotMatch(page, />Add Row<\/oj-button>/, "legacy Accounts Add Row label is absent");
assert.match(page, /const showEditActions = Boolean\(addingRow \|\| hasEditableRowChanges \|\| exchangeRate !== savedExchangeRate\)/,
  "Save/Cancel visibility is derived only from a new Draft, editable cell diff, or editable FX draft");
assert.match(page, /\{showEditActions && \([\s\S]*>Save<[\s\S]*>Cancel</,
  "Save/Cancel are conditionally rendered in the toolbar");
assert.match(page, /\{selectedCount > 0 && \([\s\S]*>Highlight<[\s\S]*>Delete</,
  "Highlight/Delete are absent from the DOM until checkbox selection exists");
assert.doesNotMatch(page, /disabled=\{selectedCount === 0\}/, "hidden selection actions do not reserve disabled toolbar slots");
const addAt = page.indexOf(">Add Account</oj-button>");
const saveAt = page.indexOf(">Save</button>");
const cancelAt = page.indexOf(">Cancel</button>", saveAt);
const highlightAt = page.indexOf(">Highlight</oj-button>");
const deleteAt = page.indexOf(">Delete</oj-button>", highlightAt);
assert.ok(addAt < saveAt && saveAt < cancelAt && cancelAt < highlightAt && highlightAt < deleteAt,
  "toolbar source order is Add Account, Save, Cancel, Highlight, Delete");
assert.doesNotMatch(page, /accounts-workloads-footer-actions/, "Save/Cancel no longer appear in a separate footer action bar");
assert.match(page, /useEffect\(\(\) => \{[\s\S]*editCell[\s\S]*CSS\.escape\(editCell\.id\)[\s\S]*CSS\.escape\(editCell\.field\)[\s\S]*editor\.focus\(\)/,
  "double-click editing focuses the real editor mounted in the selected cell");
assert.doesNotMatch(page, /editor\.select\(\)|setSelectionRange\(/,
  "saved-row editors keep native caret and double-click selection behavior after focus");
assert.match(page, /const editEntrySnapshotRef = useRef<AccountWorkloadRow \| null>\(null\)/,
  "saved-row editing captures one row snapshot at edit entry");
assert.match(page, /const cancelCurrentCell[\s\S]*editEntrySnapshotRef\.current[\s\S]*setDraftRows[\s\S]*snapshot[\s\S]*setEditCell\(null\)/,
  "Escape restores only the active row snapshot and exits cell editing");
assert.match(page, /const editorKeyDown[\s\S]*event\.isComposing \|\| event\.keyCode === 229[\s\S]*event\.key === "Escape"[\s\S]*onCancel\(\)[\s\S]*event\.key === "Enter"/,
  "all saved-row editors ignore IME command keys and share Escape/Enter behavior");
assert.equal((page.match(/onKeyDown=\{editorKeyDown\}/g) ?? []).length, 5,
  "text, textarea, number, oj-input-date, and select saved-row editors share the keyboard contract");
assert.match(page, /onDblClick=\{\(event\) => \{[\s\S]*closest\("\.accounts-workloads-edit-field"\)[\s\S]*return;[\s\S]*editEntrySnapshotRef\.current = \{ \.\.\.row \}[\s\S]*setEditCell\(\{ id: row\.id, field \}\)/,
  "cell double-click starts one snapshot session without blocking native editor double-click selection");
assert.match(page, /const addRowEditorKeyDown[\s\S]*event\.isComposing \|\| event\.keyCode === 229[\s\S]*event\.key !== "Escape"[\s\S]*setAddingRow\(null\)/,
  "Add Account Escape ignores IME composition, cancels the entire new row, and returns to the normal grid");
assert.doesNotMatch(page, /addRowSnapshotRef|cancelAddRowCell|beginAddRowCell/,
  "Add Account no longer keeps a per-cell snapshot because Escape cancels the whole new row");
assert.match(page, /workloadName: "Workload"/,
  "the Workload column uses the requested display-only label");
assert.doesNotMatch(page, /Workload Name \(Enduser\)/,
  "the legacy Workload display label is absent without renaming the workloadName field");
assert.match(targetPeriod, /export const getTargetPeriodOptions/,
  "Accounts and KPI Activities share one target-period option generator");
assert.match(page, /const targetOptions = getTargetPeriodOptions\(fiscalYear\)/,
  "Accounts Target options follow the selected fiscal year");
assert.match(page, /if \(field === "target"\)[\s\S]*<select[\s\S]*targetOptions\.map/,
  "Add Account Target uses the same constrained SelectBox options as saved-row editing");
assert.doesNotMatch(page, /renderAddInput\("target", "FY27 Q1"\)/,
  "Add Account Target is not rendered as the legacy free-text input");

assert.match(styles, /\.kpi-shell\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*100vh/,
  "the common App shell owns short-content Footer placement for every route");
assert.match(styles, /\.kpi-shell__body\s*\{[^}]*flex:\s*1 0 auto[^}]*min-height:\s*0/,
  "the common body grows for short routes and remains in document flow for long routes");
assert.match(styles, /\.kpi-shell:has\(\.kpi-side-nav\.is-open\) \.kpi-footer\s*\{[^}]*margin-left:\s*18rem[^}]*width:\s*calc\(100% - 19\.5rem\)/,
  "desktop Footer aligns to the open-navigation content wrapper edges");
assert.doesNotMatch(styles, /:has\(\.kpi-spreadsheet-page\)[^{]*\.kpi-footer/,
  "Footer layout is route-neutral rather than KPI Activities scoped");

assert.match(page, /formatAccountsWorkloadsSaveError\(error\)/,
  "Save failures must preserve and safely surface the Backend error category");
assert.doesNotMatch(page, /check the API connection and try again/,
  "validation and DB failures must not be mislabeled as generic connectivity errors");

assert.match(page, />Clone Previous FY<\/oj-button>/, "Redwood action opens previous-FY clone preview");
assert.match(page, /dialogTitle="Clone Previous FY"/, "clone uses a mounted JET dialog");
assert.match(page, /clonePreview\.accounts\.map/, "preview is grouped by Account");
assert.match(page, /toggleCloneAccount/, "account-level checkbox selects eligible workloads");
assert.match(page, /toggleCloneWorkload/, "individual workload checkboxes are supported");
assert.match(page, /item\.status === "SKIP_TARGET_EXISTS"[\s\S]*disabled/, "target-exists workloads are labeled and disabled");
assert.match(page, /disabled=\{cloneSelection\.length === 0 \|\| cloneExecuting \|\| cloneLoading \|\| draftActive \|\| saving \|\| accountsWorkloadsRefreshing/, "execute is disabled without eligible selection or during any conflicting async/draft state");
assert.match(page, /cloneAccountsWorkloadsPreviousFiscalYear[\s\S]*setSelectedRowIds\(\[\]\)[\s\S]*setDraftRows\(authoritative\.items\)[\s\S]*onRefresh\(\)/, "success clears selection/drafts and refreshes authoritative current FY rows");
assert.match(page, /const cloneGenerationRef = useRef\(0\)/, "clone async work has an explicit generation guard");
assert.match(page, /cloneGenerationRef\.current \+= 1[\s\S]*setClonePreview\(null\)[\s\S]*setCloneSelection\(\[\]\)/, "opening or cancelling invalidates stale work and clears prior candidates");
assert.match(page, /generation !== cloneGenerationRef\.current[\s\S]*fiscalYear !== cloneContextFiscalYearRef\.current/, "stale preview and clone responses are rejected after context changes");
assert.match(page, /authoritative\.preview\.targetFiscalYear !== fiscalYear[\s\S]*clonePreview\.targetFiscalYear !== fiscalYear/, "clone success rejects reconciliation outside the exact current target FY context");
assert.match(page, /disabled=\{draftActive \|\| saving \|\| accountsWorkloadsRefreshing \|\| cloneLoading \|\| cloneExecuting \|\| dataSource !== "api"\}/, "clone launch locks for drafts, save, table load, preview, and submit");
assert.match(page, /const cloneSubmitInFlightRef = useRef\(false\)/, "clone submit has an immediate ref lock");
assert.match(page, /if \(cloneSubmitInFlightRef\.current \|\| cloneExecuting \|\| !clonePreview \|\| cloneSelection\.length === 0\) return;[\s\S]*cloneSubmitInFlightRef\.current = true;[\s\S]*cloneAccountsWorkloadsPreviousFiscalYear[\s\S]*finally \{[\s\S]*cloneSubmitInFlightRef\.current = false;/, "clone submit is synchronously single-flight even before state rerenders");
assert.match(page, /catch \(error\)[\s\S]{0,180}setCloneError[\s\S]{0,120}finally/, "clone failure preserves selection for retry");
assert.match(page, /const cancelClone[\s\S]*cloneGenerationRef\.current \+= 1[\s\S]*setCloneSelection\(\[\]\)[\s\S]*setClonePreview\(null\)/, "clone cancel clears selection and candidates");
assert.match(page, /useEffect\(\(\) => \(\) => \{ cloneGenerationRef\.current \+= 1; \}, \[\]\)/, "unmount invalidates pending clone work");
assert.doesNotMatch(page, /\{cloneOpen &&\s*<oj-dialog/, "clone dialog stays mounted and is controlled by its ref");
assert.doesNotMatch(page, /ownerUserKey|owner\s*:/, "clone UI exposes no unsafe owner input");

console.log("accountsWorkloadsUiContract tests passed");
