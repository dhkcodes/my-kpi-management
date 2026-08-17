import assert from "node:assert/strict";
import { WeeklyActivityRecord } from "../src/data/weeklyActivitiesApi";
import {
  getHistoryIndex,
  getRejectedPopstateDelta,
  hasNavigationDestinationChanged,
  isCurrentContextAnchorNavigation,
  isDialogPlaceholderControlAnchor,
  isSameDocumentNavigation,
  shouldReleaseWeeklyActivityDraft,
  withHistoryIndex
} from "../src/components/weeklyActivityNavigationGuard";
import {
  isWeeklyActivityDraftDirty,
  LatestRequestGuard,
  reconcileWeeklyActivityMutation,
  validateWeeklyActivityDraft
} from "../src/components/content/weeklyActivitiesPageState";
import {
  ALLOWED_QUILL_FORMATS,
  WEEKLY_ACTIVITY_COLORS,
  deriveWeeklyActivityPlainText,
  hasWeeklyActivityVisibleBase,
  hasWeeklyActivityFormattingParity,
  promoteWeeklyActivityListMarkerStyles,
  sanitizeWeeklyActivityStyle,
  sanitizeWeeklyActivityHtml,
  SharedEditorSession,
  WeeklyActivityTarget
} from "../src/components/content/weeklyActivityEditorSession";
import {
  getFiscalYearForWeekDate,
  getWeeklyActivityFiscalYearRange
} from "../src/components/content/weeklyActivityFiscalYear";


class FakeEditor {
  html = "";
  focusCount = 0;
  getSemanticHTML() { return this.html; }
  setSemanticHTML(html: string) { this.html = html; }
  focus() { this.focusCount += 1; }
}

const editor = new FakeEditor();
const session = new SharedEditorSession(editor, {
  thisWeekHtml: "<p>Completed draft</p>",
  nextWeekHtml: "<p>Planned draft</p>"
});

assert.equal(session.activeTarget, "thisWeek");
assert.equal(editor.html, "<p>Completed draft</p>");
editor.html = "<p><strong>Updated completed</strong></p>";
session.switchTarget("nextWeek");
assert.equal(session.drafts.thisWeekHtml, "<p><strong>Updated completed</strong></p>");
assert.equal(editor.html, "<p>Planned draft</p>");
assert.equal(editor.focusCount, 1);

editor.html = "<ul><li>Next action</li></ul>";
session.switchTarget("thisWeek");
assert.equal(session.drafts.nextWeekHtml, "<ul><li>Next action</li></ul>");
assert.equal(editor.html, "<p><strong>Updated completed</strong></p>");
assert.equal(session.flush().thisWeekHtml, "<p><strong>Updated completed</strong></p>");
assert.equal(session.flush().nextWeekHtml, "<ul><li>Next action</li></ul>");

const sameTarget: WeeklyActivityTarget = session.activeTarget;
session.switchTarget(sameTarget);
assert.equal(editor.focusCount, 3, "same-target selection focuses without creating another editor");
assert.deepEqual(ALLOWED_QUILL_FORMATS, ["bold", "color", "size", "list"]);
assert.deepEqual(WEEKLY_ACTIVITY_COLORS, [
  "#161513", "#C74634", "#7A2E1E", "#8A5B00", "#0B5F66", "#2458A6", "#2E6B3F", "#5F4B8B",
  "#B3261E", "#D45B13", "#C58A00", "#007C91", "#A13E75", "#6E46A5"
]);

const colorEditor = new FakeEditor();
const colorSession = new SharedEditorSession(colorEditor, {
  thisWeekHtml: '<p><span style="color:#C74634">red draft</span></p>',
  nextWeekHtml: '<p><span style="color:#2458A6">blue draft</span></p>'
});
colorEditor.html = '<p><span style="color: rgb(199, 70, 52);">red edited</span></p>';
colorSession.switchTarget("nextWeek");
colorEditor.html = '<p><span style="color: rgb(36, 88, 166);">blue edited</span></p>';
assert.deepEqual(colorSession.flush(), {
  thisWeekHtml: '<p><span style="color: rgb(199, 70, 52);">red edited</span></p>',
  nextWeekHtml: '<p><span style="color: rgb(36, 88, 166);">blue edited</span></p>'
}, "both colored drafts survive single-editor target switching before the update payload is built");

const currentUrl = "https://example.test/weekly-activities";
const currentContextClick = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "/home" }, currentUrl), true);
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "/home", target: "_blank" }, currentUrl), false, "a new-tab target cannot discard the current-page draft");
assert.equal(isCurrentContextAnchorNavigation({ ...currentContextClick, ctrlKey: true }, { href: "/home" }, currentUrl), false, "a modifier click cannot discard the current-page draft");
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "/export", download: true }, currentUrl), false, "a download cannot discard the current-page draft");
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "#details" }, currentUrl), true, "a same-document hash navigation still replaces the active application route and must protect its draft");
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: currentUrl }, currentUrl), false, "a no-op link to the exact current URL cannot discard the draft");
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "mailto:owner@example.test" }, currentUrl), false, "external-protocol navigation cannot discard the current-page draft");
assert.equal(isDialogPlaceholderControlAnchor("#", true), true, "a JET date-picker day anchor is a dialog control, not application navigation");
assert.equal(isDialogPlaceholderControlAnchor("#details", true), false, "a real hash destination remains navigation even inside a dialog");
assert.equal(isDialogPlaceholderControlAnchor("#", false), false, "placeholder anchors outside dialogs keep the existing navigation contract");
assert.equal(hasNavigationDestinationChanged("weekly-activities", "weekly-activities", `${currentUrl}#one`, `${currentUrl}#two`), true, "same-route hash Back/Forward changes the active destination");
assert.equal(hasNavigationDestinationChanged("weekly-activities", "weekly-activities", `${currentUrl}#one`, `${currentUrl}#one`), false, "the exact same route and URL are a no-op");
assert.equal(shouldReleaseWeeklyActivityDraft("weekly-activities", "weekly-activities"), false, "same-route hash and no-op approvals retain draft ownership while the page remains mounted");
assert.equal(shouldReleaseWeeklyActivityDraft("weekly-activities", "home"), true, "leaving the weekly page releases draft ownership after approval");
assert.equal(
  isCurrentContextAnchorNavigation(currentContextClick, { href: "https://example.test/base/home" }, "https://example.test/app/weekly-activities"),
  true,
  "a browser-resolved full anchor href is compared without re-resolving it against the current path"
);

const currentHistoryState = withHistoryIndex({ routeId: "weekly-activities", preserved: true }, 2);
assert.equal(getHistoryIndex(currentHistoryState), 2);
assert.equal((currentHistoryState as { preserved: boolean }).preserved, true, "indexing preserves existing history state");
assert.equal(getRejectedPopstateDelta(2, withHistoryIndex({ routeId: "home" }, 1)), 1, "rejecting Back restores the current entry with history.go(+1)");
assert.equal(getRejectedPopstateDelta(1, withHistoryIndex({ routeId: "home" }, 2)), -1, "rejecting Forward restores the current entry with history.go(-1)");
assert.equal(getRejectedPopstateDelta(1, {}), null, "an unindexed destination is not assigned a destructive synthetic history entry");
assert.equal(isSameDocumentNavigation(`${currentUrl}#one`, `${currentUrl}#two`), true, "same-document hash entries can be indexed for reversible Back and Forward traversal");
assert.equal(isSameDocumentNavigation(currentUrl, "https://example.test/home"), false);

assert.equal(
  deriveWeeklyActivityPlainText("<p>Done<br>link</p><ul><li>Item</li><li>Next</li></ul><ol><li>Final</li></ol>"),
  "Done\nlink\n• Item\n• Next\n\n• Final",
  "canonical plain text preserves the backend's paragraph, break, list-item, and list boundaries"
);
assert.equal(
  deriveWeeklyActivityPlainText("<p>A\u200BB\u00A0 C\u202FD</p><p>E<br>F\r\nG</p>"),
  "AB C D\nE\nF\nG",
  "canonical plain text removes format/control characters and normalizes Unicode spaces"
);
assert.equal(
  deriveWeeklyActivityPlainText("<p>&copy; &euro; &CounterClockwiseContourIntegral; &#x1F600;</p>"),
  "© € ∳ 😀",
  "canonical plain text decodes the complete HTML named-entity set like the backend"
);
assert.equal(hasWeeklyActivityVisibleBase("\u0301\u200B\u00A0"), false, "standalone combining marks are not meaningful content");
assert.equal(hasWeeklyActivityVisibleBase("e\u0301"), true, "combining marks attached to a visible base remain meaningful");
const validDrafts = { thisWeekHtml: `<p>${"A".repeat(20_000)}</p>`, nextWeekHtml: `<p>${"B".repeat(20_000)}</p>` };
const baselineDrafts = { thisWeekHtml: "<p>Done</p>", nextWeekHtml: "<p>Plan</p>" };
assert.equal(isWeeklyActivityDraftDirty("2026-08-15", baselineDrafts, "2026-08-15", baselineDrafts), false, "opening an editor without changing data is not dirty");
assert.equal(isWeeklyActivityDraftDirty(
  "2026-08-15",
  { thisWeekHtml: '<p><span style="color: rgb(199, 70, 52);">Done</span></p>', nextWeekHtml: "<p>Plan</p>" },
  "2026-08-15",
  { thisWeekHtml: '<p><span style="color:#C74634">Done</span></p>', nextWeekHtml: "<p>Plan</p>" }
), false, "Quill RGB serialization that is canonically equivalent to the loaded hex does not create a false dirty state");
assert.equal(isWeeklyActivityDraftDirty("2026-08-16", baselineDrafts, "2026-08-15", baselineDrafts), true, "a real date change is dirty for page-exit protection");
assert.equal(isWeeklyActivityDraftDirty("2026-08-15", { ...baselineDrafts, nextWeekHtml: "<p>Changed</p>" }, "2026-08-15", baselineDrafts), true, "either content draft activates page-exit protection");
assert.equal(isWeeklyActivityDraftDirty("2026-08-15", baselineDrafts, "2026-08-15", baselineDrafts), false, "restoring the baseline clears dirty ownership before Cancel or after rollback");
assert.equal(validateWeeklyActivityDraft("2026-08-15", validDrafts), "", "20k per field and 40k total are accepted");
assert.match(validateWeeklyActivityDraft("2026-08-15", { ...validDrafts, thisWeekHtml: `<p>${"A".repeat(20_001)}</p>` }), /20,000/, "a field over 20k is rejected using canonical text");
assert.match(validateWeeklyActivityDraft("2026-08-15", { thisWeekHtml: "<p>\u0301</p>", nextWeekHtml: "<p>Plan</p>" }), /meaningful/, "standalone combining-mark content is rejected like the server");
assert.match(validateWeeklyActivityDraft("2026-08-15", { thisWeekHtml: "<p>bad \uFFFD</p>", nextWeekHtml: "<p>Plan</p>" }), /UTF-8/, "replacement characters are rejected instead of persisting mojibake");
assert.match(validateWeeklyActivityDraft("2026-08-15", { thisWeekHtml: "<p>bad \uD800</p>", nextWeekHtml: "<p>Plan</p>" }), /UTF-8/, "unpaired high surrogates are rejected");
assert.match(validateWeeklyActivityDraft("2026-08-15", { thisWeekHtml: "<p>bad \uDC00</p>", nextWeekHtml: "<p>Plan</p>" }), /UTF-8/, "unpaired low surrogates are rejected");
assert.equal(validateWeeklyActivityDraft("2026-08-15", { thisWeekHtml: "<p>valid 😀</p>", nextWeekHtml: "<p>Plan</p>" }), "", "valid surrogate pairs remain accepted");

assert.equal(
  sanitizeWeeklyActivityStyle("color:#7a2e1e; font-size:18px; background:url(javascript:alert(1)); position:fixed"),
  "color:#7A2E1E;font-size:18px",
  "the frontend style allow-list and canonical output match the backend"
);
assert.equal(sanitizeWeeklyActivityStyle("color:red;font-size:13px"), "", "disallowed style values are removed");
assert.equal(sanitizeWeeklyActivityStyle("color: rgb(199, 70, 52)"), "color:#C74634", "Quill RGB red is canonicalized instead of being stripped");
assert.equal(sanitizeWeeklyActivityStyle("color:rgb(36,88,166)"), "color:#2458A6", "Quill RGB blue is canonicalized with optional whitespace");
assert.equal(
  sanitizeWeeklyActivityStyle("color:rgb(179, 38, 30);font-size:10px"),
  "color:#B3261E;font-size:10px",
  "the added Crimson Red and minimum font size survive Quill CSSOM serialization"
);
assert.equal(
  sanitizeWeeklyActivityStyle("color:#6e46a5;font-size:30px"),
  "color:#6E46A5;font-size:30px",
  "the added Violet and maximum font size survive canonicalization"
);
assert.equal(sanitizeWeeklyActivityStyle("font-size:32px"), "", "sizes outside the 10px to 30px contract remain blocked");
assert.equal(
  promoteWeeklyActivityListMarkerStyles('<ol><li><span style="color:#C74634;font-size:18px">First item</span></li></ol>'),
  '<ol><li style="color:#C74634;font-size:18px"><span style="color:#C74634;font-size:18px">First item</span></li></ol>',
  "a list marker inherits the leading text color and size in persisted/view HTML"
);
assert.equal(
  hasWeeklyActivityFormattingParity(
    '<ol><li style="color:#C74634"><span style="color:#C74634">First</span></li></ol>',
    '<ol><li><span>First</span></li></ol>'
  ),
  false,
  "a stale Backend that silently strips requested color is detected before the editor is released"
);
assert.equal(
  hasWeeklyActivityFormattingParity(
    '<ul><li><span style="color:rgb(36,88,166);font-size:16px">Next</span></li></ul>',
    '<ul><li style="font-size:16px"><span style="color:#2458A6;font-size:16px">Next</span></li></ul>'
  ),
  true,
  "canonical RGB/hex and promoted list-marker style remain formatting-equivalent"
);

assert.equal(
  sanitizeWeeklyActivityHtml('<img src=x onerror="alert(1)"><script>alert(2)</script><p onclick="alert(3)">Safe & sound</p>'),
  "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;&lt;p onclick=&quot;alert(3)&quot;&gt;Safe &amp; sound&lt;/p&gt;",
  "the no-DOM fallback renders untrusted HTML as inert text"
);

const record = (activityId: number, versionNo: number, overrides: Partial<WeeklyActivityRecord> = {}): WeeklyActivityRecord => ({
  activityId,
  weekOfDate: "2026-08-15",
  thisWeekHtml: `<p>completed ${activityId}</p>`,
  thisWeekText: `completed ${activityId}`,
  nextWeekHtml: `<p>planned ${activityId}</p>`,
  nextWeekText: `planned ${activityId}`,
  versionNo,
  createdAt: "2026-08-15T00:00:00Z",
  createdBy: "tester",
  updatedAt: "2026-08-15T00:00:00Z",
  updatedBy: "tester",
  ...overrides
});
const original = [record(1, 1), record(2, 1)];
const updated = record(2, 2);
const activeQuery = { fromDate: "2026-08-01", toDate: "2026-08-31", search: "plan", page: 0, size: 50 };
assert.deepEqual(reconcileWeeklyActivityMutation(original, updated, activeQuery), [updated, original[0]], "an updated row is re-sorted by date, update time, and ID");
const created = record(3, 1);
assert.deepEqual(reconcileWeeklyActivityMutation(original, created, activeQuery), [created, original[1], original[0]], "a matching created row is visible in deterministic descending order");
const outsideDate = record(4, 1, { weekOfDate: "2026-09-01" });
assert.deepEqual(reconcileWeeklyActivityMutation(original, outsideDate, activeQuery), [original[1], original[0]], "a created row outside the active date range is excluded");
const outsideSearch = record(2, 2, { thisWeekText: "unrelated", nextWeekText: "other" });
assert.deepEqual(reconcileWeeklyActivityMutation(original, outsideSearch, activeQuery), [original[0]], "an updated row that leaves the active search is removed");
const tieRows = [
  record(7, 1, { weekOfDate: "2026-08-20", updatedAt: "2026-08-16T00:00:00Z" }),
  record(9, 1, { weekOfDate: "2026-08-20", updatedAt: "2026-08-16T00:00:00Z" }),
  record(8, 1, { weekOfDate: "2026-08-20", updatedAt: "2026-08-17T00:00:00Z" })
];
assert.deepEqual(reconcileWeeklyActivityMutation(tieRows.slice(0, 2), tieRows[2], activeQuery).map(({ activityId }) => activityId), [8, 9, 7], "fixed server ordering is weekOfDate DESC, updatedAt DESC, activityId DESC");
const fullFirstPage = Array.from({ length: 50 }, (_, index) => record(index + 1, 1, {
  updatedAt: `2026-08-${String(15 - Math.floor(index / 4)).padStart(2, "0")}T${String(23 - (index % 4)).padStart(2, "0")}:00:00Z`
}));
const newestCreate = record(100, 1, { updatedAt: "2026-08-16T00:00:00Z" });
const cappedFirstPage = reconcileWeeklyActivityMutation(fullFirstPage, newestCreate, activeQuery);
assert.equal(cappedFirstPage.length, 50, "a matching create keeps a full first page capped to the loaded window");
assert.equal(cappedFirstPage[0].activityId, 100, "the authoritative create is inserted before the oldest boundary row is evicted");

const requests = new LatestRequestGuard();
const staleRequest = requests.begin();
const latestRequest = requests.begin();
assert.equal(requests.isLatest(staleRequest), false);
assert.equal(requests.isLatest(latestRequest), true);

assert.deepEqual(getWeeklyActivityFiscalYearRange("FY26"), { fromDate: "2025-06-01", toDate: "2026-05-31" });
assert.deepEqual(getWeeklyActivityFiscalYearRange("FY27"), { fromDate: "2026-06-01", toDate: "2027-05-31" });
assert.equal(getFiscalYearForWeekDate("2025-05-31"), "FY25", "the day before June remains in the prior KAP fiscal year");
assert.equal(getFiscalYearForWeekDate("2025-06-01"), "FY26", "June 1 starts the next KAP fiscal year");
assert.equal(getFiscalYearForWeekDate("2026-05-31"), "FY26", "May 31 closes the current KAP fiscal year");
assert.equal(getFiscalYearForWeekDate("2026-06-01"), "FY27", "the next June 1 starts FY27");

console.log("weeklyActivityEditorSession tests passed");
