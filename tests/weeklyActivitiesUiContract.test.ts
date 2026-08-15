import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNavigationRouteFromPath } from "../src/components/navigationRoutes";

const page = readFileSync("src/components/content/WeeklyActivitiesPage.tsx", "utf8");
const editor = readFileSync("src/components/content/SharedWeeklyActivityEditor.tsx", "utf8");
const css = readFileSync("src/styles/app.css", "utf8");

assert.equal(getNavigationRouteFromPath("/weekly-activities").module, "weeklyActivities");
assert.match(page, /Adaptive|weekly-activity-card__sections/);
assert.match(page, /fetchWeeklyActivities/);
assert.match(page, /createWeeklyActivity/);
assert.match(page, /updateWeeklyActivity/);
assert.match(page, /From Date/);
assert.match(page, /To Date/);
assert.match(page, /Content/);
assert.match(page, /oj-input-date/);
assert.match(page, /Save Row/);
assert.match(page, /Cancel/);
assert.match(page, /This Week · Completed/);
assert.match(page, /Next Week · Planned/);
assert.doesNotMatch(page, /ellipsis|overflow menu/i);

assert.equal((editor.match(/class="weekly-activity-toolbar"/g) ?? []).length, 1, "one shared toolbar composition");
assert.equal((editor.match(/class="weekly-activity-target-selector"/g) ?? []).length, 1, "one target selector");
assert.equal((editor.match(/new QuillRuntime\(/g) ?? []).length, 1, "one Quill constructor site");
assert.match(editor, /thisWeek: "This Week · Completed"/);
assert.match(editor, /nextWeek: "Next Week · Planned"/);
assert.match(editor, /Editing: \{TARGET_LABELS\[activeTarget\]\}/);
assert.match(editor, /\{TARGET_LABELS\[inactiveTarget\]\} \(read only\)/);
assert.match(editor, /ql-list" value="bullet"/);
assert.match(editor, /ql-list" value="ordered"/);
assert.match(editor, /ql-undo/);
assert.match(editor, /ql-redo/);
assert.match(editor, /handlers:\s*\{/);
assert.match(editor, /quill\.history\.clear\(\)/);
assert.doesNotMatch(editor, /indent|align/);

assert.match(css, /\.weekly-activity-card__sections,[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
assert.match(css, /\.weekly-activity-active-editor \.ql-container \{[^}]*height: auto;/);
assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.weekly-activity-card__sections,[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);

console.log("weeklyActivitiesUiContract tests passed");
