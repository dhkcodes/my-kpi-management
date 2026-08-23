import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getNavigationPath,
  getNavigationRoute,
  getNavigationRouteFromPath,
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
assert.match(contentSource, /isKpiActivitiesRoute\(activeRoute\)[\s\S]*kpi-guide-entry-button/, "KPI Guide entry is route-gated");
assert.match(contentSource, /guideOpen && isKpiActivitiesRoute\(activeRoute\)/, "open guide cannot remain visible outside KPI routes");
assert.match(appSource, /if \(!isKpiActivitiesRoute\(activeRoute\)\) setGuideOpen\(false\)/, "route changes clear stale guide state");

console.log("navigationRoutes tests passed");
