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
assert.match(pageSource, /startEdit\(record, "thisWeek"\)/);
assert.match(pageSource, /startEdit\(record, "nextWeek"\)/);
assert.match(pageSource, /editSession\?\.target === "thisWeek" && renderEditor\(editSession\)/);
assert.match(pageSource, /editSession\?\.target === "nextWeek" && renderEditor\(editSession\)/);
assert.match(editorSource, /initialTarget: WeeklyActivityTarget/);
assert.match(editorSource, /useState<WeeklyActivityTarget>\(initialTarget\)/);
assert.doesNotMatch(editorSource, /activeTarget === target \? "✓ " : ""/);
assert.match(cssSource, /\.weekly-activity-card__sections section \.weekly-activity-editor-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);

console.log("navigation and Weekly Activities UI fixes tests passed");
