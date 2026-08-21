import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNavigationRouteFromPath } from "../src/components/navigationRoutes";
import { executeWeeklyActivityDelete, resolveFocusAfterRemoval } from "../src/components/content/weeklyActivitiesPageState";
import { WeeklyActivitiesApiError, WeeklyActivitiesPage, WeeklyActivityRecord } from "../src/data/weeklyActivitiesApi";

const page = readFileSync("src/components/content/WeeklyActivitiesPage.tsx", "utf8");
const editor = readFileSync("src/components/content/SharedWeeklyActivityEditor.tsx", "utf8");
const editorSession = readFileSync("src/components/content/weeklyActivityEditorSession.ts", "utf8");
const css = readFileSync("src/styles/app.css", "utf8");
const content = readFileSync("src/components/content/index.tsx", "utf8");
const app = readFileSync("src/components/app.tsx", "utf8");
const requirements = readFileSync("요구사항.md", "utf8");
const design = readFileSync("디자인.md", "utf8");
const tasks = readFileSync("태스크.md", "utf8");

assert.equal(getNavigationRouteFromPath("/weekly-activities").module, "weeklyActivities");
assert.match(page, /Adaptive|weekly-activity-card__sections/);
assert.match(page, /fetchWeeklyActivities/);
assert.match(page, /createWeeklyActivity/);
assert.match(page, /updateWeeklyActivity/);
assert.match(page, /deleteWeeklyActivity/);
assert.match(page, /From Date/);
assert.match(page, /To Date/);
assert.match(page, /Content/);
assert.match(page, /oj-input-date/);
assert.match(page, /saving \? "Saving…" : "Save"/);
assert.match(page, /editorFlushRef\.current\?\.\(\)/, "Save synchronously flushes the one Quill instance before building its payload");
assert.match(page, /hasWeeklyActivityFormattingParity/, "a stale Backend cannot silently release a draft after stripping requested formatting");
assert.match(page, /Cancel/);
assert.match(page, /This Week/);
assert.match(page, /Next Week/);
assert.match(page, /onDblClick=\{\(\) => startEdit\(record, target\)\}/, "double-clicking either view content column activates that target in the single editor");
assert.match(page, /weekly-activity-section-label--this-week/);
assert.match(page, /weekly-activity-section-label--next-week/);
assert.match(page, /oj-dialog/);
assert.match(page, /Delete weekly activity\?/);
assert.doesNotMatch(page, /This Week · Completed/);
assert.doesNotMatch(page, /Next Week · Planned/);
assert.doesNotMatch(page, /ellipsis|overflow menu/i);
assert.equal((page.match(/dangerouslySetInnerHTML/g) ?? []).length, 1, "one activity HTML sink");
assert.match(page, /dangerouslySetInnerHTML=\{\{ __html: sanitizeWeeklyActivityHtml\(html\) \}\}/);
assert.equal((editor.match(/dangerouslySetInnerHTML/g) ?? []).length, 1, "one preview HTML sink");
assert.match(editor, /dangerouslySetInnerHTML=\{\{ __html: sanitizeWeeklyActivityHtml\(inactiveHtml\) \}\}/);
assert.doesNotMatch(readFileSync("src/components/content/weeklyActivityEditorSession.ts", "utf8"), /element\.tagName === "SPAN"/, "safe color and size styles are retained on every allowed tag, not only span");
assert.match(page, /const requestId = requestGuardRef\.current\.begin\(\)/, "each list request gets a generation");
assert.match(page, /if \(!requestGuardRef\.current\.isLatest\(requestId\)\) return;/, "stale list responses are ignored");
assert.match(page, /if \(clearBeforeLoad\) \{\s*setItems\(\[\]\);\s*setTotalElements\(0\);/, "new searches clear stale results before loading");
assert.match(page, /reconcileWeeklyActivityMutation\(current, saved, query\)/, "the mutation response is reconciled against the active query before refresh");
assert.match(page, /fetchWeeklyActivityLoadedWindow\(query\)[\s\S]*applyAuthoritativePage\(authoritative\)/, "post-save authoritative refresh preserves every loaded page");
assert.doesNotMatch(page, /await load\(\{ \.\.\.query, page: 0 \}, false, false\)/, "post-save refresh does not collapse the loaded window back to page zero");
assert.match(page, /const controlsBusy = loading \|\| loadingMore \|\| saving \|\| deleting;/, "all conflicting controls share one busy state");
assert.match(page, /Reload list/, "partial-success and stale-version recovery provides an explicit reload action");
assert.match(page, /staleDeleteIds\.has\(record\.activityId\)/, "stale delete retries stay disabled until authoritative data is loaded");
assert.match(page, /focusEditOrAdd\(savedMatchesQuery \? saved\.activityId : null\)/, "save success restores focus to the saved row or Add Activity");
assert.match(page, /resolveFocusAfterRemoval\(items, record\.activityId\)/, "delete success resolves a deterministic next focus target");
assert.match(page, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/, "reload warns while a weekly draft is genuinely dirty");
assert.match(page, /onDirtyStateChange\?\.\(editSessionDirty\)/, "the page reports baseline-derived dirty state instead of editor presence");
assert.match(page, /isWeeklyActivityDraftDirty\(/, "date and both content drafts are compared with their baseline");
assert.match(content, /<WeeklyActivitiesPage key=\{fiscalYear\} fiscalYear=\{fiscalYear\} onDirtyStateChange=\{onWeeklyActivitiesDraftStateChange\} \/>/);
assert.match(app, /confirmWeeklyActivitiesNavigation[\s\S]*weeklyActivitiesDraftActiveRef\.current[\s\S]*window\.confirm\(UNSAVED_WEEKLY_ACTIVITY_MESSAGE\)/, "navigation confirmation is centralized around the active weekly draft ref");
assert.match(app, /handlePopState[\s\S]*const destinationHref = window\.location\.href[\s\S]*confirmWeeklyActivitiesNavigation\(route, destinationHref\)/, "browser Back and Forward pass the full destination URL, including hash, to the dirty guard");
assert.match(app, /window\.history\.replaceState\(withHistoryIndex\(window\.history\.state, currentHistoryIndex\)/, "the current browser entry is indexed without replacing the stack");
assert.match(app, /getRejectedPopstateDelta\(historyIndexRef\.current, event\.state\)[\s\S]*window\.history\.go\(restorationDelta\)/, "rejected Back and Forward restore the indexed current entry with a signed delta");
assert.doesNotMatch(app, /restoreOnReject[\s\S]*history\.pushState/, "popstate rejection never duplicates or destroys entries with pushState");
assert.match(app, /shouldReleaseWeeklyActivityDraft\(previousRoute\.id, route\.id\)[\s\S]*weeklyActivitiesDraftActiveRef\.current = false/, "approval releases ownership only when navigation unmounts WeeklyActivitiesPage");
assert.match(app, /handleNavigate[\s\S]*confirmWeeklyActivitiesNavigation\(route, destinationHref\)/, "side navigation confirms before discarding a weekly draft");
assert.match(app, /handleNavigationSelectionAction[\s\S]*isLeafNavigationId\(navigationId\)[\s\S]*handleNavigate\(navigationId\)/, "JET selection action is the single leaf SPA routing entry point");
assert.doesNotMatch(app, /href=\{leaf \? item\.href|preventLeafNativeNavigation/, "JET owns leaf activation without a competing native anchor load");
assert.match(app, /if \(anchor\.closest\("oj-navigation-list"\)\) return;/, "the document guard leaves parent drill and leaf selection to JET");
assert.doesNotMatch(app, /navigateLeafRef|anchor\.dataset\.appNavigation === "true"|onojBeforeSelect/, "capture-phase and beforeSelect synthetic navigation are removed");
assert.match(app, /document\.addEventListener\("click", handleDocumentNavigationClick, true\)/, "capture-phase anchor guard still protects unsaved weekly drafts outside navigation");
assert.match(app, /isDialogPlaceholderControlAnchor\(anchor\.getAttribute\("href"\), Boolean\(anchor\.closest\("\[role=\\"dialog\\"\] \[role=\\"grid\\"\]"\)\)\)/, "only date-grid placeholder controls are excluded before application navigation confirmation");
assert.match(app, /handleDocumentNavigationClick[\s\S]*anchor\.closest\("oj-navigation-list"\)\) return;/, "navigation-list clicks return before the global anchor guard");
assert.match(app, /handleDocumentNavigationClick[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopImmediatePropagation\(\)/, "rejected anchor navigation is fully cancelled");
assert.match(app, /href: anchor\.href/, "anchor navigation uses the browser-resolved full href and therefore respects document base URL semantics");
assert.match(app, /isSameDocumentNavigation\(window\.location\.href, destinationHref\)[\s\S]*history\.pushState\(withHistoryIndex/, "approved hash navigation creates an indexed entry so rejected Back and Forward can restore without stack mutation");
assert.doesNotMatch(app, /handleDocumentNavigationClick[\s\S]{0,180}if \(!weeklyActivitiesDraftActiveRef\.current/, "same-document entries are indexed even before a draft opens");
for (const document of [requirements, design, tasks]) {
  assert.match(document, /UTF-8/);
  assert.match(document, /BOM/);
  assert.match(document, /mojibake|문자 깨짐/);
}
assert.match(css, /\.weekly-activity-edit-column--active:focus-within/, "the active editor surface exposes a visible focus state");
assert.doesNotMatch(css, /var\(--kpi-surface-soft\)|var\(--kpi-text\)/, "weekly activity styles use only declared KPI tokens");

assert.equal((editor.match(/class="weekly-activity-toolbar"/g) ?? []).length, 1, "one shared toolbar composition");
assert.equal((editor.match(/class=\{`weekly-activity-edit-columns/g) ?? []).length, 1, "one inline two-column editor composition");
assert.equal((editor.match(/new QuillRuntime\(/g) ?? []).length, 1, "one Quill constructor site");
assert.match(editor, /thisWeek: "This Week"/);
assert.match(editor, /nextWeek: "Next Week"/);
assert.doesNotMatch(editor, /This Week · Completed/);
assert.doesNotMatch(editor, /Next Week · Planned/);
assert.match(editor, /weekly-activity-edit-columns/);
assert.match(editor, /weekly-activity-edit-column--active/);
assert.match(editor, /Select and edit/);
assert.match(editor, /ql-list" value="bullet"/);
assert.match(editor, /ql-list" value="ordered"/);
assert.match(editor, /ql-undo/);
assert.match(editor, /ql-redo/);
assert.match(editor, /handlers:\s*\{/);
assert.match(editor, /initialTarget/);
assert.match(editor, /registerFlush/);
assert.match(editor, /syncWeeklyActivityListMarkerStyles/);
assert.match(editor, /quill\.history\.clear\(\)/);
assert.doesNotMatch(editor, /indent|align/);
assert.match(editor, /WEEKLY_ACTIVITY_COLORS\.map\(\(color\) => <option value=\{color\}><\/option>\)/, "the picker renders the shared palette without a divergent duplicate list");
assert.match(editorSession, /#C74634[\s\S]*#2458A6[\s\S]*#2E6B3F[\s\S]*#B3261E[\s\S]*#6E46A5/, "the shared palette contains Oracle red, existing colors, and the added high-contrast colors");

assert.match(css, /\.weekly-activity-card__date-editor\s*\{[^}]*flex:\s*0 1 18rem;[^}]*margin-inline-end:\s*auto;[^}]*\}/, "the edit date stays left-aligned instead of consuming centered header space");
assert.match(css, /\.weekly-activity-toolbar > button,[\s\S]*\.weekly-activity-toolbar \.ql-picker[^}]*height:\s*2\.5rem/, "toolbar controls share one Redwood-sized control height");
assert.match(css, /\.weekly-activity-section-label--this-week/);
assert.match(css, /\.weekly-activity-section-label--next-week/);
assert.match(css, /\.weekly-activity-card__sections \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
assert.match(css, /\.weekly-activity-edit-columns[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
assert.match(css, /\.weekly-activity-edit-column--active \.ql-container \{[^}]*height: auto;/);
assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.weekly-activity-card__sections,[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
assert.doesNotMatch(editor, /<button[\s\S]*weekly-activity-preview__content[\s\S]*<\/button>/, "rich block preview must not be nested inside a button");

const record = (activityId: number, versionNo: number): WeeklyActivityRecord => ({
  activityId,
  weekOfDate: "2026-08-10",
  thisWeekHtml: "<p>This week</p>",
  thisWeekText: "This week",
  nextWeekHtml: "<p>Next week</p>",
  nextWeekText: "Next week",
  versionNo,
  createdAt: "2026-08-10T00:00:00Z",
  createdBy: "test",
  updatedAt: "2026-08-10T00:00:00Z",
  updatedBy: "test"
});

const pageWith = (...items: WeeklyActivityRecord[]): WeeklyActivitiesPage => ({ items, totalElements: items.length, page: 0, size: 50 });

const verifyDeleteStateTransitions = async () => {
  const sequence: string[] = [];
  const partialSuccess = await executeWeeklyActivityDelete(
    record(7, 1),
    async () => { sequence.push("deleted"); },
    async () => { sequence.push("refresh"); throw new Error("refresh unavailable"); },
    () => { sequence.push("committed"); }
  );
  assert.equal(partialSuccess.status, "deleted");
  assert.equal(partialSuccess.page, undefined);
  assert.equal(partialSuccess.refreshError?.message, "refresh unavailable");
  assert.deepEqual(sequence, ["deleted", "committed", "refresh"], "a completed DELETE is committed before best-effort refresh");

  const latest = record(7, 2);
  const conflict = await executeWeeklyActivityDelete(
    record(7, 1),
    async () => { throw new WeeklyActivitiesApiError(409, "VERSION_CONFLICT", "stale"); },
    async () => pageWith(latest),
    () => assert.fail("a conflicted DELETE must not be committed")
  );
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.page?.items[0]?.versionNo, 2, "409 refreshes the authoritative version before retry");

  let refreshed = false;
  const failure = await executeWeeklyActivityDelete(
    record(8, 1),
    async () => { throw new WeeklyActivitiesApiError(500, "SERVER_ERROR", "failed"); },
    async () => { refreshed = true; return pageWith(); },
    () => assert.fail("a failed DELETE must not be committed")
  );
  assert.equal(failure.status, "failed");
  assert.equal(refreshed, false, "non-conflict delete errors preserve the row without an unrelated refresh");

  assert.equal(resolveFocusAfterRemoval([record(1, 1), record(2, 1), record(3, 1)], 2), 3);
  assert.equal(resolveFocusAfterRemoval([record(1, 1), record(2, 1)], 2), 1);
  assert.equal(resolveFocusAfterRemoval([record(1, 1)], 1), null);
};

void verifyDeleteStateTransitions().then(() => console.log("weeklyActivitiesUiContract tests passed"));
