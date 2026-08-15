import assert from "node:assert/strict";
import {
  ALLOWED_QUILL_FORMATS,
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

console.log("weeklyActivityEditorSession tests passed");
