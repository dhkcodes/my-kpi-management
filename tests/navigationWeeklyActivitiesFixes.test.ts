import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNavigationRoute } from "../src/components/navigationRoutes";
import { navItems, NavigationItem } from "../src/data/kpiMockData";

const flattenLeaves = (items: NavigationItem[]): NavigationItem[] =>
  items.flatMap((item) => item.children ? flattenLeaves(item.children) : [item]);

assert.equal(flattenLeaves(navItems).length, 12, "the provider exposes Home plus eleven real leaf destinations");

assert.deepEqual(
  navItems.map(({ id, label, children }) => ({ id, label, childIds: children?.map((child) => child.id) })),
  [
    { id: "home", label: "Home", childIds: undefined },
    {
      id: "my-customers",
      label: "My Customers",
      childIds: ["customers-overview", "accounts-workloads", "weekly-activities", "consumption"]
    },
    {
      id: "kpis",
      label: "KPIs",
      childIds: ["activity-a", "activity-b", "activity-c1", "activity-c2", "activity-d1", "activity-f", "activity-h"]
    }
  ],
  "TreeDataProvider owns hierarchy and labels without duplicating Router href data"
);
assert.equal(getNavigationRoute("kpis").id, "home", "KPIs parent must not be a Router destination");
assert.equal(getNavigationRoute("my-customers-360").id, "home", "synthetic My Customers 360 route must be removed");

const pageSource = readFileSync("src/components/content/WeeklyActivitiesPage.tsx", "utf8");
const editorSource = readFileSync("src/components/content/SharedWeeklyActivityEditor.tsx", "utf8");
const editorSessionSource = readFileSync("src/components/content/weeklyActivityEditorSession.ts", "utf8");
const cssSource = readFileSync("src/styles/app.css", "utf8");
const appSource = readFileSync("src/components/app.tsx", "utf8");
const contentSource = readFileSync("src/components/content/index.tsx", "utf8");

assert.match(pageSource, /const \[expanded, setExpanded\] = useState<Set<number>>\(\(\) => new Set\(\)\)/);
assert.match(pageSource, /const isCollapsed = !expanded\.has\(record\.activityId\)/);
assert.match(pageSource, /if \(!append\) setExpanded\(new Set\(\)\)/);
assert.match(pageSource, /weekly-activity-card__header--expandable[\s\S]*toggleExpanded\(record\.activityId\)/, "clicking the row header toggles its expanded state");
assert.match(pageSource, /weekly-activity-card__actions" onClick=\{\(event: MouseEvent\) => event\.stopPropagation\(\)\}/, "Edit and Delete clicks do not toggle the row");
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
assert.match(cssSource, /\.weekly-activity-toolbar \.ql-size \.ql-picker-label\s*\{[\s\S]*align-items:\s*center[\s\S]*flex-direction:\s*row[\s\S]*justify-content:\s*center/, "the size text and chevron are horizontally adjacent and vertically centered");
assert.match(appSource, /<span class="kpi-navigation-row">[\s\S]*kpi-navigation-icon[\s\S]*kpi-navigation-label/, "the app-owned row wrapper keeps the icon and label in one flex row inside JET's label wrapper");
assert.match(cssSource, /\.kpi-navigation-row\s*\{[\s\S]*align-items:\s*center[\s\S]*display:\s*flex/, "the navigation row owns horizontal alignment without overriding JET internal DOM");
assert.match(cssSource, /grid-template-columns:\s*16\.5rem minmax\(0, 1fr\)/, "desktop navigation keeps the original width");
assert.match(cssSource, /\.ql-picker-label svg\s*\{[\s\S]*margin-top:\s*0[\s\S]*position:\s*static[\s\S]*top:\s*auto/, "the Quill absolute-position margin is fully reset for flex centering");
assert.match(appSource, /ArrayTreeDataProvider/, "JET TreeDataProvider owns the hierarchy");
assert.match(appSource, /data=\{navigationDataProvider\}/, "the navigation list consumes the one hierarchical provider");
assert.match(appSource, /drillMode="sliding"/);
assert.match(appSource, /item=\{\{[\s\S]*selectable:[\s\S]*!context\.data\.children/, "parent groups are non-selectable drill nodes based on the same provider data");
assert.match(appSource, /selection=\{selectedNavigationId\}/, "JET owns selected row rendering");
assert.match(appSource, /expanded=\{expandedNavigationKeys\}/, "the route ancestor restores the sliding drill stack");
assert.match(appSource, /onexpandedChanged=\{handleExpandedNavigationChanged\}/);
assert.match(appSource, /if \(anchor\.closest\("oj-navigation-list"\)\) return;/, "the document capture guard does not compete with JET navigation events");
assert.match(appSource, /onojSelectionAction=\{handleNavigationSelectionAction\}/, "JET selection action is the single leaf Router handoff");
assert.doesNotMatch(appSource, /href=\{leaf \? item\.href/, "JET owns leaf activation; the item template has no competing native current-tab navigation");
assert.doesNotMatch(appSource, /onojBeforeSelect|handleNavigationBeforeSelect/, "the conflicting beforeSelect cancellation workaround is removed");
assert.doesNotMatch(appSource, /function NavigationEntry/, "static nested UL rendering is removed in favor of TreeDataProvider");
assert.doesNotMatch(appSource, /kpi-navigation-item--selected/, "app-owned selected DOM state does not compete with JET selection");
assert.doesNotMatch(appSource, /kpi-navigation-full-name/, "hidden duplicate tooltip text cannot be copied into the sliding header");
assert.doesNotMatch(cssSource, /\.oj-selected/, "JET internal selected classes are not overridden");
assert.doesNotMatch(cssSource, /kpi-navigation-item--selected/, "selected background is not duplicated by an app-owned class");
assert.match(contentSource, /<WeeklyActivitiesPage key=\{fiscalYear\} fiscalYear=\{fiscalYear\}/, "Weekly Activities remounts and queries by the common selected FY");
assert.doesNotMatch(contentSource, /activeRoute\.module !== "weeklyActivities" && <section class="kpi-fiscal-year-panel"/, "the shared FY selector remains visible on Weekly Activities");

console.log("navigation and Weekly Activities UI fixes tests passed");
