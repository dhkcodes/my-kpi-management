import assert from "node:assert/strict";
import { WeeklyActivityRecord } from "../src/data/weeklyActivitiesApi";
import {
  getHistoryIndex,
  getRejectedPopstateDelta,
  hasNavigationDestinationChanged,
  isCurrentContextAnchorNavigation,
  isSameDocumentNavigation,
  shouldReleaseWeeklyActivityDraft,
  withHistoryIndex
} from "../src/components/weeklyActivityNavigationGuard";
import {
  LatestRequestGuard,
  reconcileWeeklyActivityMutation,
  validateWeeklyActivityDraft
} from "../src/components/content/weeklyActivitiesPageState";
import {
  ALLOWED_QUILL_FORMATS,
  deriveWeeklyActivityPlainText,
  hasWeeklyActivityVisibleBase,
  sanitizeWeeklyActivityStyle,
  sanitizeWeeklyActivityHtml,
  SharedEditorSession,
  WeeklyActivityTarget
} from "../src/components/content/weeklyActivityEditorSession";


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

const currentUrl = "https://example.test/weekly-activities";
const currentContextClick = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "/home" }, currentUrl), true);
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "/home", target: "_blank" }, currentUrl), false, "a new-tab target cannot discard the current-page draft");
assert.equal(isCurrentContextAnchorNavigation({ ...currentContextClick, ctrlKey: true }, { href: "/home" }, currentUrl), false, "a modifier click cannot discard the current-page draft");
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "/export", download: true }, currentUrl), false, "a download cannot discard the current-page draft");
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "#details" }, currentUrl), true, "a same-document hash navigation still replaces the active application route and must protect its draft");
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: currentUrl }, currentUrl), false, "a no-op link to the exact current URL cannot discard the draft");
assert.equal(isCurrentContextAnchorNavigation(currentContextClick, { href: "mailto:owner@example.test" }, currentUrl), false, "external-protocol navigation cannot discard the current-page draft");
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

console.log("weeklyActivityEditorSession tests passed");
