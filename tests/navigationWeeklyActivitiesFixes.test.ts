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
const editorSessionSource = readFileSync("src/components/content/weeklyActivityEditorSession.ts", "utf8");
const cssSource = readFileSync("src/styles/app.css", "utf8");
const appSource = readFileSync("src/components/app.tsx", "utf8");
const contentSource = readFileSync("src/components/content/index.tsx", "utf8");

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
assert.match(editorSource, /onDblClick=\{\(\) => selectTarget\(inactiveTarget\)\}/, "double-clicking the inactive edit column switches the existing editor target");
assert.match(editorSessionSource, /10px[\s\S]*12px[\s\S]*30px/, "the picker exposes the 10px to 30px range");
assert.match(editorSource, /weekly-activity-list-icon/, "list buttons use the app-owned Redwood-sized icon instead of Quill's undersized glyph");
assert.doesNotMatch(editorSource, /activeTarget === target \? "✓ " : ""/);
assert.doesNotMatch(cssSource, /\.weekly-activity-card__sections section \.weekly-activity-editor-grid/);
assert.match(cssSource, /\.weekly-activity-toolbar \.ql-size[\s\S]*width:\s*6(?:\.\d+)?rem/, "the size picker reserves one horizontal row for the number and chevron");
assert.doesNotMatch(appSource, /data-app-navigation=\{item\.children \? undefined : "true"\} onClick=/, "leaf anchors do not compete with a second bubble click handler");
assert.match(appSource, /navigateLeafRef\.current/, "the document capture path owns one stable SPA navigation callback");
assert.match(appSource, /onojBeforeSelect=\{handleNavigationBeforeSelect\}/, "JET's cancelable lifecycle is intercepted before it follows the leaf href");
assert.match(appSource, /handleNavigationBeforeSelect[\s\S]*event\.preventDefault\(\)[\s\S]*navigateLeafRef\.current\(navigationId\)/, "the JET interception prevents hard reload and delegates one SPA push");
assert.match(appSource, /aria-current=\{selected \? "page" : undefined\}/, "the app-owned current-page marker follows the canonical route after the canceled JET default");
assert.match(contentSource, /<WeeklyActivitiesPage key=\{fiscalYear\} fiscalYear=\{fiscalYear\}/, "Weekly Activities remounts and queries by the common selected FY");
assert.doesNotMatch(contentSource, /activeRoute\.module !== "weeklyActivities" && <section class="kpi-fiscal-year-panel"/, "the shared FY selector remains visible on Weekly Activities");

console.log("navigation and Weekly Activities UI fixes tests passed");
