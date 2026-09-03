import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNavigationRoute } from "../src/components/navigationRoutes";
import { navItems, NavigationItem } from "../src/data/kpiMockData";

const flattenLeaves = (items: NavigationItem[]): NavigationItem[] =>
  items.flatMap((item) => item.children ? flattenLeaves(item.children) : [item]);

assert.equal(flattenLeaves(navItems).length, 14, "the provider exposes Home plus thirteen real leaf destinations");

assert.deepEqual(
  navItems.map(({ id, label, children }) => ({ id, label, childIds: children?.map((child) => child.id) })),
  [
    { id: "home", label: "Home", childIds: undefined },
    {
      id: "my-customers",
      label: "My Customers",
      childIds: ["customers-overview", "accounts-workloads", "weekly-activities"]
    },
    {
      id: "kpis",
      label: "KPI Activities",
      childIds: ["kpis-overview", "activity-a", "activity-b", "activity-c1", "activity-c2", "activity-d1", "activity-f", "activity-h"]
    },
    { id: "consumption", label: "Consumption", childIds: ["usage-insights", "usage-records"] }
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
const headerSource = readFileSync("src/components/header.tsx", "utf8");
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
assert.match(appSource, /<oj-popup[\s\S]*id="kpiNavigationPopup"[\s\S]*autoDismiss="focusLoss"[\s\S]*initialFocus="firstFocusable"/, "JET popup owns outside-click, Escape, and initial-focus behavior");
assert.match(appSource, /<nav class="kpi-menu-matrix"[\s\S]*navItems\.map/, "the dense matrix renders from the existing canonical menu tree");
assert.match(appSource, /item\.children \? \([\s\S]*kpi-menu-group__label[\s\S]*item\.children\.map/, "parent items render as group labels while only children render links");
assert.match(appSource, /href=\{getNavigationPath\(route\)\}[\s\S]*onNavigate\(item\.id\)/, "Home and leaf destinations retain real route hrefs and the existing navigation handoff");
assert.match(appSource, /id="kpiNavigationClose"[\s\S]*onojAction=\{closeNavigation\}/, "the popup has an explicit close action");
assert.doesNotMatch(appSource, /<aside id="kpiSideNavigation"/, "the former left rail is removed");
assert.match(cssSource, /\.kpi-shell__body,[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/, "removing the rail returns its column while preserving the grid height contract for scroll-owning pages");
assert.match(cssSource, /\.kpi-menu-group\s*\{[\s\S]*grid-template-columns:\s*10\.25rem minmax\(0, 1fr\)/, "the selected Dense Category Matrix layout keeps compact labeled rows");
assert.match(cssSource, /\.kpi-menu-link\s*\{[\s\S]*border-radius:\s*999px[\s\S]*font-size:\s*0\.875rem[\s\S]*line-height:\s*1\.35/, "leaf links use readable compact pill geometry");
assert.match(cssSource, /\.kpi-menu-link:hover\s*\{[\s\S]*background:\s*#fbe9e7[\s\S]*color:\s*#6e251b/, "hover uses high-contrast Redwood warm colors instead of blue");
assert.match(cssSource, /\.kpi-menu-link:focus-visible\s*\{[\s\S]*outline:\s*3px solid #312d2a[\s\S]*outline-offset:\s*2px/, "keyboard focus has a strong visible outline");
assert.match(cssSource, /\.kpi-menu-link\.is-selected\s*\{[\s\S]*background:\s*#8b2f22[\s\S]*color:\s*#fff/, "the current selection uses a distinct high-contrast Redwood pill");
assert.match(headerSource, /aria-controls="kpiNavigationPopup"[\s\S]*navigationOpen \? "oj-ux-ico-close" : "oj-ux-ico-menu"/, "the existing first header button controls the popup and exposes distinct open/closed icons");
assert.match(cssSource, /\.ql-picker-label svg\s*\{[\s\S]*margin-top:\s*0[\s\S]*position:\s*static[\s\S]*top:\s*auto/, "the Quill absolute-position margin is fully reset for flex centering");
assert.match(appSource, /anchor\.closest\("#kpiNavigationPopup"\)/, "the document capture guard does not compete with popup leaf navigation");
assert.match(appSource, /const handleNavigate = \(navigationId: string, onAccepted\?: \(\) => void\)/, "popup close can be deferred until navigation is accepted");
assert.match(appSource, /if \(!destinationChanged\) \{\s*onAccepted\?\.\(\);\s*return;\s*\}/s, "reselecting the active leaf still closes the popup");
assert.match(appSource, /handleNavigate\(navigationId, closeNavigation\)/, "popup navigation closes only after the existing guard accepts navigation");
assert.doesNotMatch(appSource, /handleNavigate\(navigationId\);\s*closeNavigation\(\)/s, "popup must remain open when the existing navigation guard rejects navigation");
assert.doesNotMatch(appSource, /<oj-navigation-list|ArrayTreeDataProvider|drillMode="sliding"/, "the retired sliding rail is not mounted alongside the popup");
assert.doesNotMatch(appSource, /onojBeforeSelect|handleNavigationBeforeSelect/, "the conflicting beforeSelect cancellation workaround is removed");
assert.doesNotMatch(appSource, /function NavigationEntry/, "static nested UL rendering is removed in favor of TreeDataProvider");
assert.doesNotMatch(appSource, /kpi-navigation-item--selected/, "app-owned selected DOM state does not compete with JET selection");
assert.doesNotMatch(appSource, /kpi-navigation-full-name/, "hidden duplicate tooltip text cannot be copied into the sliding header");
assert.doesNotMatch(cssSource, /\.oj-selected/, "JET internal selected classes are not overridden");
assert.doesNotMatch(cssSource, /kpi-navigation-item--selected/, "selected background is not duplicated by an app-owned class");
assert.match(contentSource, /<WeeklyActivitiesPage key=\{fiscalYear\} fiscalYear=\{fiscalYear\}/, "Weekly Activities remounts and queries by the common selected FY");
assert.doesNotMatch(contentSource, /activeRoute\.module !== "weeklyActivities" && <section class="kpi-fiscal-year-panel"/, "the shared FY selector remains visible on Weekly Activities");
assert.match(appSource, /useEffect\(\(\) => \{[\s\S]{0,250}window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)[\s\S]{0,100}\}, \[activeRoute\.id\]\)/,
  "every committed route renders before the document is deterministically reset to the Fiscal Year panel");
assert.doesNotMatch(appSource, /document\.getElementById\("cockpit"\)\?\.scrollIntoView\(\{ behavior: "smooth"/,
  "navigation does not race JET focus/layout with an immediate smooth scroll on the previous render");

console.log("navigation and Weekly Activities UI fixes tests passed");
