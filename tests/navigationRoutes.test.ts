import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getNavigationPath,
  getNavigationRoute,
  getNavigationRouteFromPath,
  getCanonicalNavigationPath,
  isKpiActivitiesRoute
} from "../src/components/navigationRoutes";

assert.equal(getNavigationRoute("accounts-workloads").module, "accountsWorkloads");
assert.equal(getNavigationRoute("kpis-overview").module, "kpiPage");
assert.equal(getNavigationRoute("kpis-overview").pageTitle, "KPI Activities Overview");
assert.equal(getNavigationRouteFromPath("/kpis-overview").id, "kpis-overview");
assert.equal(getNavigationPath(getNavigationRoute("kpis-overview")), "/kpis-overview");
assert.equal(getNavigationRoute("unknown").id, "home");
assert.equal(getNavigationRouteFromPath("/accounts-workloads").id, "accounts-workloads");
assert.equal(getNavigationRouteFromPath("/accounts-workloads/").id, "accounts-workloads");
assert.equal(getNavigationRouteFromPath("/unknown").id, "home");
assert.equal(getNavigationPath(getNavigationRoute("accounts-workloads")), "/accounts-workloads");
assert.equal(getNavigationPath(getNavigationRoute("home")), "/");
assert.equal(getNavigationPath(getNavigationRoute("analysis")), "/consumption/analysis");
assert.equal(getNavigationPath(getNavigationRoute("attainment")), "/consumption/attainment");
assert.equal(getNavigationPath(getNavigationRoute("records")), "/consumption/records");
assert.equal(getNavigationRouteFromPath("/consumption/analysis").id, "analysis");
assert.equal(getNavigationRouteFromPath("/consumption/attainment").id, "attainment");
assert.equal(getNavigationRouteFromPath("/consumption/records").id, "records");
assert.equal(getCanonicalNavigationPath("/usage-insights"), "/consumption/analysis");
assert.equal(getCanonicalNavigationPath("/attainment"), "/consumption/attainment");
assert.equal(getCanonicalNavigationPath("/usage-records"), "/consumption/records");
assert.equal(getCanonicalNavigationPath("/consumption/usage-insights"), "/consumption/analysis");
assert.equal(getCanonicalNavigationPath("/consumption/usage-records"), "/consumption/records");
assert.equal(getCanonicalNavigationPath("/consumption"), "/consumption/analysis");

for (const routeId of ["kpis-overview", "activity-a", "activity-b", "activity-c1", "activity-c2", "activity-d1", "activity-f", "activity-h"]) {
  assert.equal(isKpiActivitiesRoute(getNavigationRoute(routeId)), true, `${routeId} must show KPI Guide`);
}
for (const routeId of ["home", "customers-overview", "accounts-workloads", "weekly-activities", "consumption", "unknown"]) {
  assert.equal(isKpiActivitiesRoute(getNavigationRoute(routeId)), false, `${routeId} must hide KPI Guide`);
}
assert.equal(isKpiActivitiesRoute(getNavigationRouteFromPath("/activity-d1")), true, "direct KPI detail path must show KPI Guide");
assert.equal(isKpiActivitiesRoute(getNavigationRouteFromPath("/accounts-workloads")), false, "direct non-KPI path must hide KPI Guide");

const contentSource = readFileSync("src/components/content/index.tsx", "utf8");
const appSource = readFileSync("src/components/app.tsx", "utf8");
const toolbarSource = readFileSync("src/components/PageNavigationToolbar.tsx", "utf8");
const stylesSource = readFileSync("src/styles/app.css", "utf8");
assert.match(contentSource, /isKpiActivitiesRoute\(activeRoute\)[\s\S]*kpi-guide-entry-button/, "KPI Guide entry is route-gated");
assert.match(contentSource, /guideOpen && isKpiActivitiesRoute\(activeRoute\)/, "open guide cannot remain visible outside KPI routes");
assert.match(appSource, /if \(!isKpiActivitiesRoute\(activeRoute\)\) setGuideOpen\(false\)/, "route changes clear stale guide state");
assert.match(toolbarSource, /import \{ navItems, NavigationItem \}/, "the page menu uses the actual navigation definition");
assert.match(toolbarSource, /<oj-toolbar chroming="borderless"/, "the page menu uses the Oracle JET borderless toolbar pattern");
assert.match(toolbarSource, /const path = getPagePath\(activeRoute\.id\)/, "the toolbar derives only the active route path");
assert.match(toolbarSource, /Home[\s\S]*<oj-menu-button[\s\S]*path\.current\.label/, "the current path renders Home, its parent menu, and the current page");
assert.match(toolbarSource, /onojMenuAction=\{\(event\) => onNavigate\(String\(event\.detail\.selectedValue\)\)\}/, "selecting a submenu route delegates to application navigation");
assert.match(toolbarSource, /aria-current=\{child\.id === activeRoute\.id \? "page" : undefined\}/, "the current submenu route remains exposed to assistive technology");
assert.match(toolbarSource, /activeRouteId === "profile" \|\| activeRouteId === "users"/, "Profile and Users are excluded from the page path without changing their routes");
assert.doesNotMatch(toolbarSource, /accountRouteItems|getVisibleAccountRouteItems/, "Profile and Users are not injected into the path menu");
assert.doesNotMatch(toolbarSource, /Customer Management/, "the page menu never invents a customer menu label");
assert.match(contentSource, /const pageNavigation = <PageNavigationToolbar activeRoute=\{activeRoute\} access=\{profile\.access\}/, "the shared page menu is created once from route and permission state");
assert.doesNotMatch(contentSource, /\n\s*<PageNavigationToolbar activeRoute=\{activeRoute\}/, "the page menu is not rendered as a detached content sibling");
for (const file of [
  "AccountsWorkloadsPage.tsx",
  "AccountsWorkloadsPulseV2.tsx",
  "AttainmentPage.tsx",
  "ConsumptionAnalysisPage.tsx",
  "ConsumptionRecordsPage.tsx",
  "KpiSpreadsheetPage.tsx",
  "MyCustomers360Page.tsx",
  "ProfilePage.tsx",
  "UsersPage.tsx",
  "WeeklyActivitiesPage.tsx"
]) {
  const pageSource = readFileSync(`src/components/content/${file}`, "utf8");
  assert.match(pageSource, /\{breadcrumb\}[\s\S]{0,220}<h[12]/, `${file} renders the page menu inside its title surface`);
}
assert.match(stylesSource, /\.kpi-page-menu \+ \.kpi-eyebrow \{ display: none; \}/, "the integrated page menu replaces the old duplicated route eyebrow");
assert.doesNotMatch(stylesSource, /\.kpi-page-menu__item\.is-current::after/, "the current page never uses an underline indicator");
assert.match(stylesSource, /\.kpi-page-menu__item\.is-current\s*\{[\s\S]*font-weight:\s*700;[\s\S]*color:/, "the current page uses restrained weight and color emphasis");

console.log("navigationRoutes tests passed");
