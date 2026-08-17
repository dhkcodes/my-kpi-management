import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNavigationPath, getNavigationRoute } from "../src/components/navigationRoutes";
import { navItems, NavigationItem } from "../src/data/kpiMockData";

const flattenLeaves = (items: NavigationItem[]): NavigationItem[] =>
  items.flatMap((item) => item.children ? flattenLeaves(item.children) : [item]);

for (const item of flattenLeaves(navItems)) {
  assert.equal(
    item.href,
    getNavigationPath(getNavigationRoute(item.id)),
    `${item.id} must link to its canonical page instead of falling back to Home`
  );
}

const pageSource = readFileSync("src/components/content/WeeklyActivitiesPage.tsx", "utf8");
const editorSource = readFileSync("src/components/content/SharedWeeklyActivityEditor.tsx", "utf8");
const cssSource = readFileSync("src/styles/app.css", "utf8");

assert.match(pageSource, /const \[expanded, setExpanded\] = useState<Set<number>>\(\(\) => new Set\(\)\)/);
assert.match(pageSource, /const isCollapsed = !expanded\.has\(record\.activityId\)/);
assert.match(pageSource, /if \(!append\) setExpanded\(new Set\(\)\)/);
assert.doesNotMatch(pageSource, />This Week · Completed</);
assert.doesNotMatch(pageSource, />Next Week · Planned</);
assert.match(pageSource, />This Week</);
assert.match(pageSource, />Next Week</);
assert.match(pageSource, /aria-label=\{`Edit /);
assert.match(pageSource, /oj-ux-ico-edit/);
assert.match(pageSource, /aria-label=\{`Delete /);
assert.match(pageSource, /oj-ux-ico-trash/);
assert.doesNotMatch(pageSource, /startEdit\(record, "thisWeek"\)/);
assert.doesNotMatch(pageSource, /startEdit\(record, "nextWeek"\)/);
assert.doesNotMatch(pageSource, /renderEditor\(editSession\)/, "edit must not append a separate editor below the view columns");
assert.match(pageSource, /isEditing[\s\S]*<SharedWeeklyActivityEditor/);
assert.match(pageSource, /isEditing[\s\S]*weeklyActivityWeekDate-/);
assert.match(pageSource, /isEditing[\s\S]*Save[\s\S]*Cancel/);
assert.match(pageSource, /<oj-dialog[\s\S]*Delete weekly activity\?/);
assert.doesNotMatch(pageSource, /editSession\?\.target === "thisWeek" && renderEditor\(editSession\)/);
assert.doesNotMatch(pageSource, /editSession\?\.target === "nextWeek" && renderEditor\(editSession\)/);
assert.match(editorSource, /initialTarget\?: WeeklyActivityTarget/);
assert.match(editorSource, /useState<WeeklyActivityTarget>\(initialTarget\)/);
assert.equal((editorSource.match(/new QuillRuntime\(/g) ?? []).length, 1, "one WYSIWYG instance controls both columns");
assert.doesNotMatch(editorSource, /activeTarget === target \? "✓ " : ""/);
assert.doesNotMatch(cssSource, /\.weekly-activity-card__sections section \.weekly-activity-editor-grid/);

console.log("navigation and Weekly Activities UI fixes tests passed");
